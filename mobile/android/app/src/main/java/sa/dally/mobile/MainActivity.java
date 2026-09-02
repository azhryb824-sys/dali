package sa.dally.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.appcompat.app.AlertDialog;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private boolean rendererFailureShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                runOnUiThread(() -> recoverFromRendererFailure(webView));
                return true;
            }
        });
        super.onCreate(savedInstanceState);
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
}
