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
            controller.muteAudio = call.getBool("muteAudio") ?? false

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
    var muteAudio = false
    var onFinish: (([[String: Any]], Bool) -> Void)?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "opi.native.camera.session")
    private var previewLayer: AVCaptureVideoPreviewLayer!

    // Session-queue-only state. Never touch these from main.
    private var currentDevice: AVCaptureDevice?
    private var initialZoom: CGFloat = 1

    // Main-thread-only state.
    private var mode: NativeCaptureMode = .photo
    private var capturedMedia: [[String: Any]] = []
    private var recordingStartedAt: Date?
    private var isSessionReady = false
    private var isRecordingActive = false
    /// Photos being processed plus recordings not yet finalized. Closing waits
    /// for this to reach zero so a capture taken right before ✕ isn't dropped.
    private var inFlightCaptures = 0
    private var closeRequested = false
    private var didFinish = false
    /// AVCaptureDevice.RotationCoordinator on iOS 17+ (typed loosely because
    /// stored properties can't carry @available).
    private var rotationCoordinator: AnyObject?
    private var previewRotationObservation: NSKeyValueObservation?

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
        updateControlsEnabled()
        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        requestPermissionsAndStart()
    }

    deinit {
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
    }

    override var prefersStatusBarHidden: Bool { true }

    private func requestPermissionsAndStart() {
        AVCaptureDevice.requestAccess(for: .video) { videoAllowed in
            guard videoAllowed else {
                DispatchQueue.main.async { self.finish(cancelled: true) }
                return
            }

            if self.allowVideo && !self.muteAudio {
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
                DispatchQueue.main.async { self.failAndClose() }
                return
            }

            self.session.addInput(input)
            self.currentDevice = device

            guard self.session.canAddOutput(self.photoOutput) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.failAndClose() }
                return
            }
            self.session.addOutput(self.photoOutput)
            self.photoOutput.isHighResolutionCaptureEnabled = true

            var videoAvailable = false
            if self.allowVideo && self.session.canAddOutput(self.movieOutput) {
                self.session.addOutput(self.movieOutput)
                videoAvailable = true
            }

            if self.allowVideo && !self.muteAudio,
               let audioDevice = AVCaptureDevice.default(for: .audio),
               let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
               self.session.canAddInput(audioInput) {
                self.session.addInput(audioInput)
            }

            self.session.commitConfiguration()
            self.session.startRunning()

            let running = self.session.isRunning

            DispatchQueue.main.async {
                guard running else {
                    self.failAndClose()
                    return
                }
                if !videoAvailable { self.allowVideo = false }
                self.previewLayer = AVCaptureVideoPreviewLayer(session: self.session)
                self.previewLayer.videoGravity = .resizeAspectFill
                self.previewLayer.frame = self.view.bounds
                self.view.layer.insertSublayer(self.previewLayer, at: 0)
                self.installRotationTracking(for: device)
                self.isSessionReady = true
                self.applyModeUI()
                self.updateControlsEnabled()
            }
        }
    }

    /// Configuration failed: tell the user, then close and return whatever
    /// was captured (normally nothing).
    private func failAndClose() {
        guard !didFinish else { return }
        isSessionReady = false
        updateControlsEnabled()

        let alert = UIAlertController(
            title: "Camera unavailable",
            message: "The camera couldn't be started. Please try again.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            self.finish(cancelled: self.capturedMedia.isEmpty)
        })
        present(alert, animated: true)
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

    // MARK: - Rotation

    /// Main thread. (Re)creates the rotation coordinator for `device` and keeps
    /// the preview connection level with the horizon.
    private func installRotationTracking(for device: AVCaptureDevice) {
        if #available(iOS 17.0, *) {
            previewRotationObservation = nil
            let coordinator = AVCaptureDevice.RotationCoordinator(
                device: device,
                previewLayer: previewLayer
            )
            rotationCoordinator = coordinator
            previewRotationObservation = coordinator.observe(
                \.videoRotationAngleForHorizonLevelPreview,
                options: [.initial, .new]
            ) { [weak self] coordinator, _ in
                let angle = coordinator.videoRotationAngleForHorizonLevelPreview
                DispatchQueue.main.async {
                    guard let connection = self?.previewLayer?.connection,
                          connection.isVideoRotationAngleSupported(angle) else { return }
                    connection.videoRotationAngle = angle
                }
            }
        } else {
            updatePreviewOrientation()
        }
    }

    /// Main thread. iOS < 17: match the preview to the interface orientation.
    private func updatePreviewOrientation() {
        if #available(iOS 17.0, *) { return }
        guard let connection = previewLayer?.connection,
              connection.isVideoOrientationSupported,
              let orientation = interfaceVideoOrientation() else { return }
        connection.videoOrientation = orientation
    }

    private func interfaceVideoOrientation() -> AVCaptureVideoOrientation? {
        switch view.window?.windowScene?.interfaceOrientation {
        case .portrait: return .portrait
        case .portraitUpsideDown: return .portraitUpsideDown
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        default: return nil
        }
    }

    /// Main thread. The orientation to stamp on the next photo or recording,
    /// from the physical device orientation (falling back to the interface).
    private func captureRotation() -> (angle: CGFloat?, orientation: AVCaptureVideoOrientation) {
        if #available(iOS 17.0, *),
           let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            return (coordinator.videoRotationAngleForHorizonLevelCapture, .portrait)
        }

        let orientation: AVCaptureVideoOrientation
        switch UIDevice.current.orientation {
        case .portrait: orientation = .portrait
        case .portraitUpsideDown: orientation = .portraitUpsideDown
        // Device and video landscape orientations are mirrored.
        case .landscapeLeft: orientation = .landscapeRight
        case .landscapeRight: orientation = .landscapeLeft
        default: orientation = interfaceVideoOrientation() ?? .portrait
        }
        return (nil, orientation)
    }

    /// Session queue. Applies a rotation captured on main to an output connection.
    private func apply(
        _ rotation: (angle: CGFloat?, orientation: AVCaptureVideoOrientation),
        to connection: AVCaptureConnection
    ) {
        if #available(iOS 17.0, *), let angle = rotation.angle {
            if connection.isVideoRotationAngleSupported(angle) {
                connection.videoRotationAngle = angle
            }
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = rotation.orientation
        }
    }

    override func viewWillTransition(
        to size: CGSize,
        with coordinator: UIViewControllerTransitionCoordinator
    ) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { _ in
            self.updatePreviewOrientation()
        }
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        updatePreviewOrientation()
    }

    // MARK: - UI

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

        closeButton.accessibilityLabel = "Close camera"
        torchButton.accessibilityLabel = "Flash"
        torchButton.accessibilityValue = "Off"
        flipButton.accessibilityLabel = "Switch camera"
        macroButton.accessibilityLabel = "Macro focus"
        macroButton.accessibilityValue = "Off"
        lockButton.accessibilityLabel = "Lock focus and exposure"
        lockButton.accessibilityValue = "Off"

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
        modeControl.accessibilityLabel = "Capture mode"
        view.addSubview(modeControl)

        shutterButton.backgroundColor = .white
        shutterButton.layer.cornerRadius = 38
        shutterButton.layer.borderWidth = 5
        shutterButton.layer.borderColor = UIColor.white.cgColor
        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        shutterButton.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)
        shutterButton.isAccessibilityElement = true
        shutterButton.accessibilityTraits = .button
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
        updateShutterAccessibility()
    }

    /// Main thread. Capture controls stay disabled until the session is running.
    private func updateControlsEnabled() {
        let ready = isSessionReady && !closeRequested && !didFinish
        shutterButton.isEnabled = ready
        shutterButton.alpha = ready ? 1 : 0.4
        [torchButton, flipButton, macroButton, lockButton].forEach { $0.isEnabled = ready }
        flipButton.isEnabled = ready && !isRecordingActive
        modeControl.isEnabled = ready && !isRecordingActive
        closeButton.isEnabled = !closeRequested && !didFinish
    }

    private func updateShutterAccessibility() {
        if mode == .photo {
            shutterButton.accessibilityLabel = "Take photo"
        } else {
            shutterButton.accessibilityLabel = isRecordingActive ? "Stop recording" : "Record"
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    @objc private func closeTapped() {
        if isRecordingActive {
            stopRecording()
            return
        }
        if inFlightCaptures > 0 {
            // Wait for in-flight photos/recordings to land, then close.
            closeRequested = true
            updateControlsEnabled()
            return
        }
        finish(cancelled: capturedMedia.isEmpty)
    }

    /// Main thread. Called whenever an in-flight capture completes.
    private func captureCompleted() {
        inFlightCaptures = max(0, inFlightCaptures - 1)
        if closeRequested && inFlightCaptures == 0 && !isRecordingActive {
            finish(cancelled: capturedMedia.isEmpty)
        }
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
        updateShutterAccessibility()
    }

    @objc private func shutterTapped() {
        guard isSessionReady, !closeRequested, !didFinish else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        if mode == .photo {
            capturePhoto()
        } else if isRecordingActive {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private func capturePhoto() {
        let rotation = captureRotation()
        inFlightCaptures += 1

        sessionQueue.async {
            guard let connection = self.photoOutput.connection(with: .video),
                  connection.isActive else {
                DispatchQueue.main.async { self.captureCompleted() }
                return
            }

            self.apply(rotation, to: connection)

            let settings = AVCapturePhotoSettings()
            if self.photoOutput.isHighResolutionCaptureEnabled {
                settings.isHighResolutionPhotoEnabled = true
            }
            if self.currentDevice?.hasFlash == true,
               self.photoOutput.supportedFlashModes.contains(.auto) {
                settings.flashMode = .auto
            }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    private func startRecording() {
        let rotation = captureRotation()
        AudioServicesPlaySystemSound(1113)

        isRecordingActive = true
        inFlightCaptures += 1
        recordingStartedAt = Date()
        recordingLabel.isHidden = false
        recordingLabel.text = "REC 00:00"
        shutterButton.layer.cornerRadius = 10
        updateShutterAccessibility()
        updateControlsEnabled()
        startRecordingClock()

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("opi-video-\(UUID().uuidString).mov")

        sessionQueue.async {
            guard let connection = self.movieOutput.connection(with: .video),
                  connection.isActive,
                  !self.movieOutput.isRecording else {
                DispatchQueue.main.async {
                    self.resetRecordingUI()
                    self.captureCompleted()
                }
                return
            }

            self.apply(rotation, to: connection)
            self.movieOutput.startRecording(to: url, recordingDelegate: self)
        }
    }

    private func stopRecording() {
        AudioServicesPlaySystemSound(1114)
        sessionQueue.async {
            if self.movieOutput.isRecording {
                self.movieOutput.stopRecording()
            }
        }
    }

    /// Main thread.
    private func resetRecordingUI() {
        isRecordingActive = false
        recordingStartedAt = nil
        recordingLabel.isHidden = true
        shutterButton.layer.cornerRadius = 38
        updateShutterAccessibility()
        updateControlsEnabled()
    }

    private func startRecordingClock() {
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] timer in
            guard let self, self.isRecordingActive, let started = self.recordingStartedAt else {
                timer.invalidate()
                return
            }
            let seconds = Int(Date().timeIntervalSince(started))
            self.recordingLabel.text = String(format: "REC %02d:%02d", seconds / 60, seconds % 60)
        }
    }

    // MARK: - Device controls (device state lives on sessionQueue)

    @objc private func torchTapped() {
        sessionQueue.async {
            guard let device = self.currentDevice, device.hasTorch else { return }
            do {
                try device.lockForConfiguration()
                device.torchMode = device.torchMode == .on ? .off : .on
                let isOn = device.torchMode == .on
                device.unlockForConfiguration()
                DispatchQueue.main.async {
                    self.torchButton.accessibilityValue = isOn ? "On" : "Off"
                }
            } catch {}
        }
    }

    @objc private func lockTapped() {
        sessionQueue.async {
            guard let device = self.currentDevice else { return }
            do {
                try device.lockForConfiguration()
                let locked: Bool
                if device.focusMode == .locked {
                    if device.isFocusModeSupported(.continuousAutoFocus) {
                        device.focusMode = .continuousAutoFocus
                    }
                    if device.isExposureModeSupported(.continuousAutoExposure) {
                        device.exposureMode = .continuousAutoExposure
                    }
                    locked = false
                } else {
                    if device.isFocusModeSupported(.locked) {
                        device.focusMode = .locked
                    }
                    if device.isExposureModeSupported(.locked) {
                        device.exposureMode = .locked
                    }
                    locked = true
                }
                device.unlockForConfiguration()
                DispatchQueue.main.async {
                    self.lockButton.backgroundColor = locked
                        ? .systemYellow
                        : UIColor.black.withAlphaComponent(0.48)
                    self.lockButton.accessibilityValue = locked ? "On" : "Off"
                }
            } catch {}
        }
    }

    @objc private func macroTapped() {
        sessionQueue.async {
            guard let device = self.currentDevice else { return }
            do {
                try device.lockForConfiguration()
                var macroOn: Bool?
                if device.isAutoFocusRangeRestrictionSupported {
                    device.autoFocusRangeRestriction =
                        device.autoFocusRangeRestriction == .near ? .none : .near
                    macroOn = device.autoFocusRangeRestriction == .near
                }
                if device.isFocusModeSupported(.continuousAutoFocus) {
                    device.focusMode = .continuousAutoFocus
                }
                device.unlockForConfiguration()
                if let macroOn {
                    DispatchQueue.main.async {
                        self.macroButton.backgroundColor = macroOn
                            ? .systemCyan
                            : UIColor.black.withAlphaComponent(0.48)
                        self.macroButton.accessibilityValue = macroOn ? "On" : "Off"
                    }
                }
            } catch {}
        }
    }

    @objc private func flipTapped() {
        sessionQueue.async {
            guard let currentInput = self.session.inputs
                .compactMap({ $0 as? AVCaptureDeviceInput })
                .first(where: { $0.device.hasMediaType(.video) }) else { return }
            let nextPosition: AVCaptureDevice.Position =
                currentInput.device.position == .back ? .front : .back
            guard let nextDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: nextPosition),
                  let nextInput = try? AVCaptureDeviceInput(device: nextDevice) else { return }

            self.session.beginConfiguration()
            self.session.removeInput(currentInput)
            let activeDevice: AVCaptureDevice
            if self.session.canAddInput(nextInput) {
                self.session.addInput(nextInput)
                self.currentDevice = nextDevice
                activeDevice = nextDevice
            } else {
                self.session.addInput(currentInput)
                activeDevice = currentInput.device
            }
            self.session.commitConfiguration()

            DispatchQueue.main.async {
                // Reset toggle UI for the new device and re-track its rotation.
                let off = UIColor.black.withAlphaComponent(0.48)
                self.lockButton.backgroundColor = off
                self.macroButton.backgroundColor = off
                self.torchButton.accessibilityValue = "Off"
                self.lockButton.accessibilityValue = "Off"
                self.macroButton.accessibilityValue = "Off"
                self.installRotationTracking(for: activeDevice)
            }
        }
    }

    @objc private func focusTapped(_ gesture: UITapGestureRecognizer) {
        guard let previewLayer, isSessionReady else { return }
        let point = gesture.location(in: view)
        if point.y > view.bounds.height - 170 { return }

        let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: point)

        sessionQueue.async {
            guard let device = self.currentDevice else { return }
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
        }

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
        let state = gesture.state
        let scale = gesture.scale

        sessionQueue.async {
            guard let device = self.currentDevice else { return }

            if state == .began {
                self.initialZoom = device.videoZoomFactor
            }

            let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 8)
            let next = max(1, min(self.initialZoom * scale, maxZoom))

            do {
                try device.lockForConfiguration()
                device.videoZoomFactor = next
                device.unlockForConfiguration()
            } catch {}
        }
    }

    // MARK: - AVFoundation delegates (called off main)

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
        } catch {
            return
        }

        let image = UIImage(data: data)
        let width = Int(image?.size.width ?? 0)
        let height = Int(image?.size.height ?? 0)

        if autoSaveGallery, let image {
            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
        }

        DispatchQueue.main.async {
            self.appendMedia(
                url: url,
                fileName: fileName,
                mimeType: "image/jpeg",
                mediaType: "photo",
                width: width,
                height: height,
                duration: nil
            )
        }
    }

    /// The last callback for every photo request, success or failure.
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
        error: Error?
    ) {
        DispatchQueue.main.async { self.captureCompleted() }
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        DispatchQueue.main.async {
            // Restart the clock from when frames actually began recording.
            if self.isRecordingActive {
                self.recordingStartedAt = Date()
            }
        }
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        // A recording can finish "with error" yet still be usable (e.g. max
        // duration or disk-space stop).
        let succeeded = error == nil ||
            ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool == true)

        var duration: Double?
        if succeeded {
            let seconds = CMTimeGetSeconds(AVURLAsset(url: outputFileURL).duration)
            duration = seconds.isFinite ? seconds : nil
        }

        if succeeded && autoSaveGallery {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else { return }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: outputFileURL)
                })
            }
        }

        DispatchQueue.main.async {
            self.resetRecordingUI()
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()

            if succeeded {
                self.appendMedia(
                    url: outputFileURL,
                    fileName: outputFileURL.lastPathComponent,
                    mimeType: "video/quicktime",
                    mediaType: "video",
                    width: 0,
                    height: 0,
                    duration: duration
                )
            }

            self.captureCompleted()
        }
    }

    /// Main thread.
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

    /// Main thread.
    private func finish(cancelled: Bool) {
        guard !didFinish else { return }
        didFinish = true
        updateControlsEnabled()
        previewRotationObservation = nil

        sessionQueue.async {
            self.session.stopRunning()
        }

        let media = capturedMedia
        dismiss(animated: true) {
            self.onFinish?(media, cancelled)
        }
    }
}
