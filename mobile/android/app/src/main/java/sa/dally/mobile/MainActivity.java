package sa.dally.mobile;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String PRODUCTION_PORTAL = "https://www.dally.info/portal";
    private static final long PORTAL_RENDER_CHECK_DELAY_MS = 7000L;

    private final Handler renderCheckHandler = new Handler(Looper.getMainLooper());
    private boolean rendererFailureShown = false;
    private boolean blankPageRecoveryUsed = false;
    private boolean blankPageDialogShown = false;
    private boolean compatibilityNoticeShown = false;
    private boolean infinixCompatibilityMode = false;
    private Runnable pendingRenderCheck;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                cancelPendingRenderCheck();
            }

            @Override
            public void onPageLoaded(WebView webView) {
                schedulePortalRenderCheck(webView);
            }

            @Override
            public void onPageCommitVisible(WebView webView, String url) {
                schedulePortalRenderCheck(webView);
            }

            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                runOnUiThread(() -> recoverFromRendererFailure(webView));
                return true;
            }
        });
        super.onCreate(savedInstanceState);
        configureWebViewForDevice();
    }

    private void configureWebViewForDevice() {
        if (bridge == null || bridge.getWebView() == null) return;
        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();

        webView.setBackgroundColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) webView.setForceDarkAllowed(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) settings.setAlgorithmicDarkeningAllowed(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        infinixCompatibilityMode = isInfinixDevice();
        if (!infinixCompatibilityMode) return;

        // Some XOS builds expose a black hardware-rendered WebView surface after
        // an authenticated redirect. Limit the software fallback to Infinix only.
        webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        String currentAgent = settings.getUserAgentString();
        if (currentAgent != null && !currentAgent.contains("DaliInfinix/1")) {
            settings.setUserAgentString(currentAgent + " DaliInfinix/1");
            webView.stopLoading();
            webView.loadUrl(PRODUCTION_PORTAL);
        }
    }

    private static boolean isInfinixDevice() {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        String brand = Build.BRAND == null ? "" : Build.BRAND.toLowerCase(Locale.ROOT);
        return manufacturer.contains("infinix") || brand.contains("infinix");
    }

    private void schedulePortalRenderCheck(WebView webView) {
        if (webView == null) return;
        String url = webView.getUrl();
        if (url == null || !url.startsWith(PRODUCTION_PORTAL)) return;
        cancelPendingRenderCheck();
        pendingRenderCheck = () -> inspectPortalRender(webView);
        renderCheckHandler.postDelayed(pendingRenderCheck, PORTAL_RENDER_CHECK_DELAY_MS);
    }

    private void cancelPendingRenderCheck() {
        if (pendingRenderCheck == null) return;
        renderCheckHandler.removeCallbacks(pendingRenderCheck);
        pendingRenderCheck = null;
    }

    private void inspectPortalRender(WebView webView) {
        if (isFinishing() || isDestroyed() || webView == null) return;
        String script = "(function(){try{var b=document.body;if(!b)return 'no-body';var t=(b.innerText||'').trim().length;var s=!!document.querySelector('.admin-shell,.portal-gate,.language-onboarding');return document.readyState+'|'+t+'|'+(s?'shell':'no-shell');}catch(e){return 'js-error';}})()";
        webView.evaluateJavascript(script, result -> {
            boolean portalVisible = hasVisiblePortalContent(result);
            if (portalVisible) {
                blankPageRecoveryUsed = false;
                blankPageDialogShown = false;
                if (infinixCompatibilityMode && !compatibilityNoticeShown) {
                    compatibilityNoticeShown = true;
                    Toast.makeText(this, R.string.infinix_compatibility_active, Toast.LENGTH_LONG).show();
                }
                return;
            }
            recoverBlankPortal(webView, result);
        });
    }

    private boolean hasVisiblePortalContent(String diagnostic) {
        if (diagnostic == null) return false;
        String normalized = diagnostic.replace("\"", "");
        String[] fields = normalized.split("\\|");
        if (fields.length < 3 || !"shell".equals(fields[2])) return false;
        try {
            return Integer.parseInt(fields[1]) >= 12;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    private void recoverBlankPortal(WebView webView, String diagnostic) {
        if (!blankPageRecoveryUsed) {
            blankPageRecoveryUsed = true;
            Toast.makeText(this, R.string.webview_blank_retrying, Toast.LENGTH_LONG).show();
            webView.clearCache(true);
            webView.loadUrl(PRODUCTION_PORTAL + "?renderRecovery=1");
            return;
        }
        if (blankPageDialogShown || isFinishing() || isDestroyed()) return;
        blankPageDialogShown = true;
        String code = diagnostic == null ? "NO_RESULT" : diagnostic.replace("\"", "");
        new AlertDialog.Builder(this)
            .setTitle(R.string.webview_blank_title)
            .setMessage(getString(R.string.webview_blank_message, code))
            .setCancelable(false)
            .setPositiveButton(R.string.webview_retry, (dialog, which) -> {
                blankPageDialogShown = false;
                blankPageRecoveryUsed = false;
                webView.loadUrl(PRODUCTION_PORTAL + "?renderRecovery=2");
            })
            .setNegativeButton(R.string.webview_close, (dialog, which) -> finishAndRemoveTask())
            .show();
    }

    private void recoverFromRendererFailure(WebView webView) {
        if (rendererFailureShown || isFinishing() || isDestroyed()) return;
        rendererFailureShown = true;

        if (webView != null) {
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.destroy();
        }

        new AlertDialog.Builder(this)
            .setTitle(R.string.webview_failure_title)
            .setMessage(R.string.webview_failure_message)
            .setCancelable(false)
            .setPositiveButton(R.string.webview_retry, (dialog, which) -> restartApplication())
            .setNegativeButton(R.string.webview_close, (dialog, which) -> finishAndRemoveTask())
            .show();
    }

    private void restartApplication() {
        Intent restart = new Intent(this, MainActivity.class);
        restart.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(restart);
        finish();
    }

    @Override
    public void onDestroy() {
        cancelPendingRenderCheck();
        super.onDestroy();
    }
}
