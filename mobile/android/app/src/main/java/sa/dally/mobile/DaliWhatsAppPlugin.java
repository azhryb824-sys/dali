package sa.dally.mobile;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.net.URLConnection;
import java.util.ArrayList;

@CapacitorPlugin(name = "DaliWhatsApp")
public class DaliWhatsAppPlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        getActivity().runOnUiThread(() -> shareOnUiThread(call));
    }

    private void shareOnUiThread(PluginCall call) {
        try {
            // Only the trusted portal may ask the native bridge to share its cached downloads.
            Uri page = Uri.parse(getBridge().getWebView().getUrl());
            if (!"https".equals(page.getScheme()) || !"www.dally.info".equals(page.getHost())) throw new SecurityException("Untrusted origin");
            JSArray paths = call.getArray("files");
            if (paths == null || paths.length() < 1 || paths.length() > 200) throw new IllegalArgumentException("Invalid files");
            File root = new File(getContext().getCacheDir(), "dali-share").getCanonicalFile();
            ArrayList<Uri> uris = new ArrayList<>();
            String mime = null;
            long total = 0;
            for (int i = 0; i < paths.length(); i++) {
                Uri source = Uri.parse(paths.getString(i));
                if (!"file".equals(source.getScheme())) throw new SecurityException("Invalid file URI");
                File file = new File(source.getPath()).getCanonicalFile();
                if (!file.getPath().startsWith(root.getPath() + File.separator) || !file.isFile()) throw new SecurityException("Invalid cache file");
                total += file.length();
                if (file.length() == 0 || total > 200L * 1024 * 1024) throw new IllegalArgumentException("Invalid size");
                String fileMime = URLConnection.guessContentTypeFromName(file.getName());
                if (file.getName().toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) fileMime = "application/pdf";
                if (fileMime == null) fileMime = "application/octet-stream";
                mime = mime == null ? fileMime : mime.equals(fileMime) ? mime : "*/*";
                uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file));
            }
            Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
            send.setType(mime);
            if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            ClipData clip = ClipData.newUri(getContext().getContentResolver(), "Dali files", uris.get(0));
            for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
            send.setClipData(clip);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
            send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", ""));
            send.setPackage("com.whatsapp");
            if (send.resolveActivity(getContext().getPackageManager()) == null) send.setPackage("com.whatsapp.w4b");
            if (send.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("لم يُعثر على واتساب أو واتساب للأعمال على الجهاز.");
                return;
            }
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(send);
                    JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
                } catch (Exception error) { call.reject("تعذّر فتح واتساب بالملفات.", error); }
            });
        } catch (Exception error) { call.reject("تعذّر تجهيز الملفات لواتساب.", error); }
    }
}
