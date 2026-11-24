package sh.neo.scheduled;

/** 仅记录 premain 已运行；普通非 Spring 应用无需加载任何 Spring 类。 */
public final class LocalAgent {
    static volatile boolean active;
    public static void premain(String argument) {
        active = true;
    }
}
