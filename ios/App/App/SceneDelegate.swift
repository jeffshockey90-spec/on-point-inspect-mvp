import UIKit
import Capacitor

// iOS 27 SDK requires the UIScene life cycle: apps that only use an app
// delegate fail to launch. The scene also lets iOS resize the app when it moves
// between screen sizes (iPhone Duo outer/inner screen, iPad windows).
//
// The window and root view controller come from Main.storyboard via
// UISceneStoryboardFile in Info.plist. URL and universal-link events now arrive
// here instead of on the app delegate, so forward them to Capacitor's proxy to
// keep App plugin deep links (appUrlOpen) working.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Cold launch from a link: the URL / activity is delivered here only.
        if let urlContext = connectionOptions.urlContexts.first {
            openURL(urlContext)
        }
        if let userActivity = connectionOptions.userActivities.first {
            continueActivity(userActivity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let urlContext = URLContexts.first else { return }
        openURL(urlContext)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continueActivity(userActivity)
    }

    private func openURL(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let source = context.options.sourceApplication {
            options[.sourceApplication] = source
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = context.options.openInPlace
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    private func continueActivity(_ userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity) { _ in }
    }
}
