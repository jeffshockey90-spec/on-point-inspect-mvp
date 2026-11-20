import Foundation
import Capacitor
import Photos
import UIKit

@objc(NativeGalleryPlugin)
public class NativeGalleryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeGalleryPlugin"
    public let jsName = "NativeGallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVideo", returnType: CAPPluginReturnPromise)
    ]

    /// Base64 payloads above this (≈150 MB decoded) are refused rather than
    /// decoded, so an oversized blob can't run the app out of memory. Large
    /// media must be saved by `path` instead.
    private static let maxDataUrlLength = 150 * 1024 * 1024 / 3 * 4 + 1024

    private enum Source {
        case fileURL(URL)
        case data(Data)
    }

    /// Resolves the call to either an existing on-device file (`path`, a plain
    /// path or file:// URL) or decoded base64 (`dataUrl`).
    private func source(_ call: CAPPluginCall, kind: String) -> Source? {
        if let rawPath = call.getString("path"), !rawPath.isEmpty {
            let url: URL
            if rawPath.hasPrefix("file://"), let parsed = URL(string: rawPath) {
                url = parsed
            } else {
                url = URL(fileURLWithPath: rawPath)
            }
            guard FileManager.default.fileExists(atPath: url.path) else {
                call.reject("The \(kind) file no longer exists on this device.")
                return nil
            }
            return .fileURL(url)
        }

        guard let dataUrl = call.getString("dataUrl") else {
            call.reject("The selected \(kind) could not be decoded.")
            return nil
        }
        guard dataUrl.utf8.count <= Self.maxDataUrlLength else {
            call.reject("The selected \(kind) is too large to save to Photos (limit 150 MB).")
            return nil
        }
        let base64 = dataUrl.components(separatedBy: ",").last ?? dataUrl
        guard let data = Data(base64Encoded: base64) else {
            call.reject("The selected \(kind) could not be decoded.")
            return nil
        }
        return .data(data)
    }

    private func requestAddPermission(_ completion: @escaping (Bool) -> Void) {
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                completion(status == .authorized || status == .limited)
            }
        } else {
            PHPhotoLibrary.requestAuthorization { status in
                completion(status == .authorized)
            }
        }
    }

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let source = source(call, kind: "image") else { return }

        let image: UIImage?
        switch source {
        case .fileURL:
            image = nil
        case .data(let data):
            guard let decoded = UIImage(data: data) else {
                call.reject("The selected image could not be decoded.")
                return
            }
            image = decoded
        }

        requestAddPermission { allowed in
            guard allowed else {
                call.reject("Photo Library permission was not granted.")
                return
            }

            PHPhotoLibrary.shared().performChanges({
                if case .fileURL(let url) = source {
                    PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: url)
                } else if let image {
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }
            }) { success, error in
                if success {
                    call.resolve(["saved": true])
                } else {
                    call.reject(error?.localizedDescription ?? "The image could not be saved.")
                }
            }
        }
    }

    @objc func saveVideo(_ call: CAPPluginCall) {
        guard let source = source(call, kind: "video") else { return }

        let url: URL
        let isTemporaryCopy: Bool
        switch source {
        case .fileURL(let fileURL):
            // Save the caller's file in place; it isn't ours to delete.
            url = fileURL
            isTemporaryCopy = false
        case .data(let data):
            let requestedName = call.getString("fileName") ?? "on-point-video.mp4"
            let safeName = requestedName.replacingOccurrences(of: "/", with: "-")
            url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            isTemporaryCopy = true

            do {
                try data.write(to: url, options: .atomic)
            } catch {
                call.reject("The temporary video file could not be created.")
                return
            }
        }

        requestAddPermission { allowed in
            guard allowed else {
                if isTemporaryCopy { try? FileManager.default.removeItem(at: url) }
                call.reject("Photo Library permission was not granted.")
                return
            }

            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { success, error in
                if isTemporaryCopy { try? FileManager.default.removeItem(at: url) }

                if success {
                    call.resolve(["saved": true])
                } else {
                    call.reject(error?.localizedDescription ?? "The video could not be saved.")
                }
            }
        }
    }
}
