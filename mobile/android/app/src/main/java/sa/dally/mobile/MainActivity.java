package sa.dally.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DaliWhatsAppPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
