package sh.neo.scheduled;

import java.nio.file.*;
import java.util.Locale;

/** 定位 OpenIDEA 自己创建的私有目录，不将配对凭据写入业务工作区或安装包。 */
final class SessionDirectory {
    private static final String ID = "neo.api-tools";
    static Path locate() throws Exception {
        Path jar = Paths.get(LocalAgent.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        // 正式安装布局：plugins/<id>/<version>/dist，旧的平铺布局没有版本目录。
        for (Path p = jar.getParent(); p != null && p.getParent() != null; p = p.getParent()) {
            if (ID.equals(p.getFileName().toString()) && "plugins".equals(String.valueOf(p.getParent().getFileName())))
                return files(p.getParent());
        }
        // 从磁盘链接开发目录时，沿用桌面版的 data_dir 规则。
        String base = System.getenv("OPENIDEA_DATA_DIR");
        String os = System.getProperty("os.name").toLowerCase(Locale.ROOT);
        Path home = Paths.get(System.getProperty("user.home"));
        Path data;
        if (base != null && !base.isEmpty()) data = Paths.get(base);
        else if (os.startsWith("windows")) data = Paths.get(System.getenv("APPDATA"));
        else if (os.startsWith("mac")) data = home.resolve("Library/Application Support");
        else {
            String xdg = System.getenv("XDG_DATA_HOME");
            data = xdg == null || xdg.isEmpty() ? home.resolve(".local/share") : Paths.get(xdg);
        }
        return files(data.resolve("ai.l0ng.openidea/plugins"));
    }
    private static Path files(Path plugins) {
        return plugins.resolve(".data").resolve(ID).resolve("files");
    }
}
