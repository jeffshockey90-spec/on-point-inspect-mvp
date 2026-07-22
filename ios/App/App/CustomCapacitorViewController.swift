import Capacitor

class CustomCapacitorViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeGalleryPlugin())
        bridge?.registerPluginInstance(NativeCameraPlugin())

        // Enables the native iOS edge-swipe gesture to go back/forward,
        // mapped onto the web app's browser history (and therefore the
        // Next.js router's client-side navigation history).
        bridge?.webView?.allowsBackForwardNavigationGestures = true
    }
}
