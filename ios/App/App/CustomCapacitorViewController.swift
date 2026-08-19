import Capacitor
import UIKit

class CustomCapacitorViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeGalleryPlugin())
        bridge?.registerPluginInstance(NativeCameraPlugin())

        // Enables the native iOS edge-swipe gesture to go back/forward,
        // mapped onto the web app's browser history (and therefore the
        // Next.js router's client-side navigation history).
        bridge?.webView?.allowsBackForwardNavigationGestures = true

        applyInstantTapFix()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Re-assert in case the web view reset the scroll view after load.
        applyInstantTapFix()
    }

    // Removes the ~150ms tap delay that makes buttons feel like they need a
    // second press. By default WKWebView's scroll view waits on every touch to
    // decide whether it's the start of a scroll, delaying (and sometimes eating)
    // quick taps app-wide. Deliver touches to the web content immediately;
    // scrolling still works because the scroll view can cancel the touch if the
    // finger actually drags.
    private func applyInstantTapFix() {
        guard let scrollView = bridge?.webView?.scrollView else { return }
        scrollView.delaysContentTouches = false
        scrollView.canCancelContentTouches = true
    }
}
