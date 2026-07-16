import Foundation
import Capacitor
import AVFoundation
import Photos
import UIKit
import AudioToolbox

@objc(NativeCameraPlugin)
public class NativeCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCameraPlugin"
    public let jsName = "NativeCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readFileChunk", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("Unable to present the native camera.")
                return
            }

            let controller = NativeFieldCameraViewController()
            controller.allowVideo = call.getBool("allowVideo") ?? true
            controller.autoSaveGallery = call.getBool("autoSaveGallery") ?? true
            controller.preferredMode =
                call.getString("preferredMode") == "video" ? .video : .photo

            controller.onFinish = { media, cancelled in
                call.resolve([
                    "cancelled": cancelled,
                    "media": media
                ])
            }

            controller.modalPresentationStyle = .fullScreen
            host.present(controller, animated: true)
        }
    }

    @objc func readFileChunk(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("path"), !rawPath.isEmpty else {
            call.reject("Missing native media path.")
            return
        }

        let offset = max(0, call.getInt("offset") ?? 0)
        let requestedLength = min(
            2 * 1024 * 1024,
            max(1, call.getInt("length") ?? 1024 * 1024)
        )

        let path: String
        if rawPath.hasPrefix("file://"),
           let url = URL(string: rawPath) {
            path = url.path
        } else {
            path = rawPath
        }

        guard FileManager.default.fileExists(atPath: path) else {
            call.reject("Native media file no longer exists.")
            return
        }

        do {
            let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
            defer { try? handle.close() }

            try handle.seek(toOffset: UInt64(offset))
            let data = try handle.read(upToCount: requestedLength) ?? Data()
            let attributes = try FileManager.default.attributesOfItem(atPath: path)
            let totalSize = (attributes[.size] as? NSNumber)?.intValue ?? 0
            let nextOffset = offset + data.count

            call.resolve([
                "base64": data.base64EncodedString(),
                "bytesRead": data.count,
                "nextOffset": nextOffset,
                "totalSize": totalSize,
                "eof": nextOffset >= totalSize || data.isEmpty
            ])
        } catch {
            call.reject("Could not read native media: \(error.localizedDescription)")
        }
    }
}

private enum NativeCaptureMode {
    case photo
    case video
}

private final class NativeFieldCameraViewController:
    UIViewController,
    AVCapturePhotoCaptureDelegate,
    AVCaptureFileOutputRecordingDelegate
{
    var allowVideo = true
    var autoSaveGallery = true
    var preferredMode: NativeCaptureMode = .photo
    var onFinish: (([[String: Any]], Bool) -> Void)?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "opi.native.camera.session")
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private var currentDevice: AVCaptureDevice?
    private var mode: NativeCaptureMode = .photo
    private var capturedMedia: [[String: Any]] = []
    private var initialZoom: CGFloat = 1
    private var recordingStartedAt: Date?

    private let shutterButton = UIButton(type: .custom)
    private let closeButton = UIButton(type: .system)
    private let modeControl = UISegmentedControl(items: ["PHOTO", "VIDEO"])
    private let torchButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let macroButton = UIButton(type: .system)
    private let lockButton = UIButton(type: .system)
    private let counterLabel = UILabel()
    private let recordingLabel = UILabel()
    private let focusView = UIView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        mode = preferredMode
        configureUI()
        requestPermissionsAndStart()
    }

    override var prefersStatusBarHidden: Bool { true }

    private func requestPermissionsAndStart() {
        AVCaptureDevice.requestAccess(for: .video) { videoAllowed in
            guard videoAllowed else {
                DispatchQueue.main.async { self.finish(cancelled: true) }
                return
            }

            if self.allowVideo {
                AVCaptureDevice.requestAccess(for: .audio) { _ in
                    self.configureSession()
                }
            } else {
                self.configureSession()
            }
        }
    }

    private func configureSession() {
        sessionQueue.async {
            self.session.beginConfiguration()
            self.session.sessionPreset = .high

            guard let device = self.bestBackCamera(),
                  let input = try? AVCaptureDeviceInput(device: device),
                  self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                return
            }

            self.session.addInput(input)
            self.currentDevice = device

            if self.session.canAddOutput(self.photoOutput) {
                self.session.addOutput(self.photoOutput)
                self.photoOutput.isHighResolutionCaptureEnabled = true
            }

            if self.allowVideo && self.session.canAddOutput(self.movieOutput) {
                self.session.addOutput(self.movieOutput)
            }

            if self.allowVideo,
               let audioDevice = AVCaptureDevice.default(for: .audio),
               let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
               self.session.canAddInput(audioInput) {
                self.session.addInput(audioInput)
            }

            self.session.commitConfiguration()
            self.session.startRunning()

            DispatchQueue.main.async {
                self.previewLayer = AVCaptureVideoPreviewLayer(session: self.session)
                self.previewLayer.videoGravity = .resizeAspectFill
                self.previewLayer.frame = self.view.bounds
                self.view.layer.insertSublayer(self.previewLayer, at: 0)
                self.applyModeUI()
            }
        }
    }

    private func bestBackCamera() -> AVCaptureDevice? {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInTripleCamera,
                .builtInDualWideCamera,
                .builtInDualCamera,
                .builtInWideAngleCamera
            ],
            mediaType: .video,
            position: .back
        )

        return discovery.devices.first ??
            AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    }

    private func configureUI() {
        [closeButton, torchButton, flipButton, macroButton, lockButton].forEach {
            $0.tintColor = .white
            $0.backgroundColor = UIColor.black.withAlphaComponent(0.48)
            $0.layer.cornerRadius = 22
            $0.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview($0)
        }

        closeButton.setTitle("✕", for: .normal)
        torchButton.setTitle("⚡", for: .normal)
        flipButton.setTitle("↻", for: .normal)
        macroButton.setTitle("MACRO", for: .normal)
        lockButton.setTitle("LOCK", for: .normal)

        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        torchButton.addTarget(self, action: #selector(torchTapped), for: .touchUpInside)
        flipButton.addTarget(self, action: #selector(flipTapped), for: .touchUpInside)
        macroButton.addTarget(self, action: #selector(macroTapped), for: .touchUpInside)
        lockButton.addTarget(self, action: #selector(lockTapped), for: .touchUpInside)

        modeControl.selectedSegmentIndex = preferredMode == .video ? 1 : 0
        modeControl.translatesAutoresizingMaskIntoConstraints = false
        modeControl.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        modeControl.selectedSegmentTintColor = .white
        modeControl.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
        modeControl.setTitleTextAttributes([.foregroundColor: UIColor.black], for: .selected)
        modeControl.addTarget(self, action: #selector(modeChanged), for: .valueChanged)
        view.addSubview(modeControl)

        shutterButton.backgroundColor = .white
        shutterButton.layer.cornerRadius = 38
        shutterButton.layer.borderWidth = 5
        shutterButton.layer.borderColor = UIColor.white.cgColor
        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        shutterButton.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)
        view.addSubview(shutterButton)

        counterLabel.textColor = .white
        counterLabel.font = .boldSystemFont(ofSize: 14)
        counterLabel.textAlignment = .center
        counterLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(counterLabel)

        recordingLabel.textColor = .white
        recordingLabel.backgroundColor = .systemRed
        recordingLabel.layer.cornerRadius = 14
        recordingLabel.clipsToBounds = true
        recordingLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .bold)
        recordingLabel.textAlignment = .center
        recordingLabel.isHidden = true
        recordingLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(recordingLabel)

        focusView.layer.borderColor = UIColor.systemYellow.cgColor
        focusView.layer.borderWidth = 2
        focusView.layer.cornerRadius = 8
        focusView.isHidden = true
        view.addSubview(focusView)

        let tap = UITapGestureRecognizer(target: self, action: #selector(focusTapped(_:)))
        view.addGestureRecognizer(tap)

        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:)))
        view.addGestureRecognizer(pinch)

        NSLayoutConstraint.activate([
            closeButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),

            torchButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            torchButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            torchButton.widthAnchor.constraint(equalToConstant: 44),
            torchButton.heightAnchor.constraint(equalToConstant: 44),

            macroButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            macroButton.topAnchor.constraint(equalTo: closeButton.bottomAnchor, constant: 12),
            macroButton.widthAnchor.constraint(equalToConstant: 72),
            macroButton.heightAnchor.constraint(equalToConstant: 44),

            lockButton.leadingAnchor.constraint(equalTo: macroButton.trailingAnchor, constant: 8),
            lockButton.topAnchor.constraint(equalTo: macroButton.topAnchor),
            lockButton.widthAnchor.constraint(equalToConstant: 64),
            lockButton.heightAnchor.constraint(equalToConstant: 44),

            modeControl.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            modeControl.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -20),
            modeControl.widthAnchor.constraint(equalToConstant: 220),

            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18),
            shutterButton.widthAnchor.constraint(equalToConstant: 76),
            shutterButton.heightAnchor.constraint(equalToConstant: 76),

            flipButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            flipButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            flipButton.widthAnchor.constraint(equalToConstant: 52),
            flipButton.heightAnchor.constraint(equalToConstant: 52),

            counterLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            counterLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 18),
            counterLabel.widthAnchor.constraint(equalToConstant: 180),

            recordingLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            recordingLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            recordingLabel.widthAnchor.constraint(equalToConstant: 92),
            recordingLabel.heightAnchor.constraint(equalToConstant: 30)
        ])

        updateCounter()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    @objc private func closeTapped() {
        if movieOutput.isRecording {
            movieOutput.stopRecording()
            return
        }
        finish(cancelled: capturedMedia.isEmpty)
    }

    @objc private func modeChanged() {
        mode = modeControl.selectedSegmentIndex == 1 ? .video : .photo
        applyModeUI()
    }

    private func applyModeUI() {
        if mode == .video && !allowVideo {
            mode = .photo
            modeControl.selectedSegmentIndex = 0
        }

        shutterButton.backgroundColor = mode == .video ? .systemRed : .white
    }

    @objc private func shutterTapped() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        if mode == .photo {
            let settings = AVCapturePhotoSettings()
            settings.isHighResolutionPhotoEnabled = true
            if currentDevice?.hasFlash == true {
                settings.flashMode = .auto
            }
            photoOutput.capturePhoto(with: settings, delegate: self)
            return
        }

        if movieOutput.isRecording {
            AudioServicesPlaySystemSound(1114)
            movieOutput.stopRecording()
        } else {
            AudioServicesPlaySystemSound(1113)

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("opi-video-\(UUID().uuidString).mov")

            movieOutput.startRecording(
                to: url,
                recordingDelegate: self
            )

            recordingStartedAt = Date()
            recordingLabel.isHidden = false
            recordingLabel.text = "REC 00:00"
            shutterButton.layer.cornerRadius = 10
            startRecordingClock()
        }
    }

    private func startRecordingClock() {
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] timer in
            guard let self, self.movieOutput.isRecording, let started = self.recordingStartedAt else {
                timer.invalidate()
                return
            }
            let seconds = Int(Date().timeIntervalSince(started))
            self.recordingLabel.text = String(format: "REC %02d:%02d", seconds / 60, seconds % 60)
        }
    }

    @objc private func torchTapped() {
        guard let device = currentDevice, device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            device.torchMode = device.torchMode == .on ? .off : .on
            device.unlockForConfiguration()
        } catch {}
    }

    @objc private func lockTapped() {
        guard let device = currentDevice else { return }
        do {
            try device.lockForConfiguration()
            if device.focusMode == .locked {
                if device.isFocusModeSupported(.continuousAutoFocus) {
                    device.focusMode = .continuousAutoFocus
                }
                if device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposureMode = .continuousAutoExposure
                }
                lockButton.backgroundColor = UIColor.black.withAlphaComponent(0.48)
            } else {
                if device.isFocusModeSupported(.locked) {
                    device.focusMode = .locked
                }
                if device.isExposureModeSupported(.locked) {
                    device.exposureMode = .locked
                }
                lockButton.backgroundColor = .systemYellow
            }
            device.unlockForConfiguration()
        } catch {}
    }

    @objc private func macroTapped() {
        guard let device = currentDevice else { return }
        do {
            try device.lockForConfiguration()
            if device.isAutoFocusRangeRestrictionSupported {
                device.autoFocusRangeRestriction =
                    device.autoFocusRangeRestriction == .near ? .none : .near
                macroButton.backgroundColor =
                    device.autoFocusRangeRestriction == .near
                    ? .systemCyan
                    : UIColor.black.withAlphaComponent(0.48)
            }
            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            }
            device.unlockForConfiguration()
        } catch {}
    }

    @objc private func flipTapped() {
        sessionQueue.async {
            guard let currentInput = self.session.inputs.compactMap({ $0 as? AVCaptureDeviceInput }).first else { return }
            let nextPosition: AVCaptureDevice.Position =
                currentInput.device.position == .back ? .front : .back
            guard let nextDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: nextPosition),
                  let nextInput = try? AVCaptureDeviceInput(device: nextDevice) else { return }

            self.session.beginConfiguration()
            self.session.removeInput(currentInput)
            if self.session.canAddInput(nextInput) {
                self.session.addInput(nextInput)
                self.currentDevice = nextDevice
            } else {
                self.session.addInput(currentInput)
            }
            self.session.commitConfiguration()
        }
    }

    @objc private func focusTapped(_ gesture: UITapGestureRecognizer) {
        guard let previewLayer, let device = currentDevice else { return }
        let point = gesture.location(in: view)
        if point.y > view.bounds.height - 170 { return }

        let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: point)

        do {
            try device.lockForConfiguration()
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = devicePoint
                if device.isFocusModeSupported(.autoFocus) {
                    device.focusMode = .autoFocus
                }
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = devicePoint
                if device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposureMode = .continuousAutoExposure
                }
            }
            device.unlockForConfiguration()
        } catch {}

        focusView.frame = CGRect(x: point.x - 38, y: point.y - 38, width: 76, height: 76)
        focusView.isHidden = false
        focusView.alpha = 1
        UIView.animate(withDuration: 0.22, animations: {
            self.focusView.transform = CGAffineTransform(scaleX: 0.72, y: 0.72)
        }) { _ in
            UIView.animate(withDuration: 0.55, animations: {
                self.focusView.alpha = 0
            }) { _ in
                self.focusView.isHidden = true
                self.focusView.transform = .identity
            }
        }
    }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        guard let device = currentDevice else { return }

        if gesture.state == .began {
            initialZoom = device.videoZoomFactor
        }

        let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 8)
        let next = max(1, min(initialZoom * gesture.scale, maxZoom))

        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = next
            device.unlockForConfiguration()
        } catch {}
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }

        let fileName = "opi-photo-\(UUID().uuidString).jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        do {
            try data.write(to: url, options: .atomic)
            let image = UIImage(data: data)
            appendMedia(
                url: url,
                fileName: fileName,
                mimeType: "image/jpeg",
                mediaType: "photo",
                width: Int(image?.size.width ?? 0),
                height: Int(image?.size.height ?? 0),
                duration: nil
            )
            if autoSaveGallery, let image {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            }
        } catch {}
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        recordingLabel.isHidden = true
        shutterButton.layer.cornerRadius = 38
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()

        guard error == nil else { return }

        let asset = AVURLAsset(url: outputFileURL)
        let duration = CMTimeGetSeconds(asset.duration)
        appendMedia(
            url: outputFileURL,
            fileName: outputFileURL.lastPathComponent,
            mimeType: "video/quicktime",
            mediaType: "video",
            width: 0,
            height: 0,
            duration: duration.isFinite ? duration : nil
        )

        if autoSaveGallery {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else { return }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: outputFileURL)
                })
            }
        }
    }

    private func appendMedia(
        url: URL,
        fileName: String,
        mimeType: String,
        mediaType: String,
        width: Int,
        height: Int,
        duration: Double?
    ) {
        var item: [String: Any] = [
            "path": url.absoluteString,
            "fileName": fileName,
            "mimeType": mimeType,
            "mediaType": mediaType,
            "width": width,
            "height": height
        ]

        if let duration {
            item["durationSeconds"] = duration
        }

        capturedMedia.append(item)
        updateCounter()
    }

    private func updateCounter() {
        counterLabel.text = "\(capturedMedia.count) captured"
    }

    private func finish(cancelled: Bool) {
        sessionQueue.async {
            self.session.stopRunning()
        }

        dismiss(animated: true) {
            self.onFinish?(self.capturedMedia, cancelled)
        }
    }
}
