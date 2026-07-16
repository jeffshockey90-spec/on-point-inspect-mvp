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

    private func decodedData(_ call: CAPPluginCall) -> Data? {
        guard let dataUrl = call.getString("dataUrl") else { return nil }
        let base64 = dataUrl.components(separatedBy: ",").last ?? dataUrl
        return Data(base64Encoded: base64)
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
        guard let data = decodedData(call), let image = UIImage(data: data) else {
            call.reject("The selected image could not be decoded.")
            return
        }

        requestAddPermission { allowed in
            guard allowed else {
                call.reject("Photo Library permission was not granted.")
                return
            }

            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
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
        guard let data = decodedData(call) else {
            call.reject("The selected video could not be decoded.")
            return
        }

        let requestedName = call.getString("fileName") ?? "on-point-video.mp4"
        let safeName = requestedName.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)

        do {
            try data.write(to: url, options: .atomic)
        } catch {
            call.reject("The temporary video file could not be created.")
            return
        }

        requestAddPermission { allowed in
            guard allowed else {
                try? FileManager.default.removeItem(at: url)
                call.reject("Photo Library permission was not granted.")
                return
            }

            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { success, error in
                try? FileManager.default.removeItem(at: url)

                if success {
                    call.resolve(["saved": true])
                } else {
                    call.reject(error?.localizedDescription ?? "The video could not be saved.")
                }
            }
        }
    }
}
