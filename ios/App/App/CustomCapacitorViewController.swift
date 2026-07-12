import Capacitor

class CustomCapacitorViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeGalleryPlugin())
    }
}
