package sh.neo.scheduled;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.springframework.aop.support.AopUtils;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.Schedules;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.support.ScheduledMethodRunnable;
import java.io.*;
import java.lang.management.ManagementFactory;
import java.lang.reflect.Method;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.logging.*;

/** 本机调试桥：仅从 Spring 实际注册的任务中选择，不提供任意类或方法调用入口。 */
public final class ScheduledBridge implements ApplicationListener<ApplicationEvent> {
    private static final Logger LOG = Logger.getLogger("NeoScheduled");
    private final Map<String, ScheduledMethodRunnable> jobs = new HashMap<>();
    private final String session = UUID.randomUUID().toString();
    private final String secret = UUID.randomUUID().toString() + UUID.randomUUID();
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "neo-manual-scheduled"); t.setDaemon(true); return t;
    });
    private HttpServer server;
    private Path descriptor;
    private ConfigurableApplicationContext context;

    @Override public synchronized void onApplicationEvent(ApplicationEvent event) {
        if (!LocalAgent.active) return;
        if (event instanceof ApplicationReadyEvent && context == null) {
            context = ((ApplicationReadyEvent)event).getApplicationContext();
            // 自动加载覆盖不同 Spring 版本；缺少调度 API 时只停用调试桥，不阻止业务启动。
            try { start(); } catch (Exception | LinkageError e) { close(); LOG.log(Level.WARNING, "本地任务触发未启用", e); }
        } else if (event instanceof ContextClosedEvent && ((ContextClosedEvent)event).getApplicationContext() == context) {
            close();
        }
    }
    private void start() throws Exception {
        // 同一个 Bean 方法可有多个 cron；手动点击只应执行一次。
        IdentityHashMap<Object, Set<Method>> seen = new IdentityHashMap<>();
        List<String> rows = new ArrayList<>();
        for (ScheduledAnnotationBeanPostProcessor processor : context.getBeansOfType(ScheduledAnnotationBeanPostProcessor.class).values()) {
            for (ScheduledTask scheduled : processor.getScheduledTasks()) {
                Runnable action = scheduled.getTask().getRunnable();
                if (!(action instanceof ScheduledMethodRunnable)) continue;
                ScheduledMethodRunnable task = (ScheduledMethodRunnable)action;
                Method method = AopUtils.getMostSpecificMethod(task.getMethod(), AopUtils.getTargetClass(task.getTarget()));
                if (method.getParameterCount() != 0 || AnnotatedElementUtils.getMergedRepeatableAnnotations(method, Scheduled.class, Schedules.class).isEmpty()) continue;
                if (!seen.computeIfAbsent(task.getTarget(), k -> new HashSet<>()).add(method)) continue;
                String id = Integer.toString(jobs.size());
                jobs.put(id, task);
                // 输出目录用于识别工作目录被自定义的多模块启动配置。
                java.security.CodeSource code = method.getDeclaringClass().getProtectionDomain().getCodeSource();
                String origin = code != null && "file".equals(code.getLocation().getProtocol())
                        ? Paths.get(code.getLocation().toURI()).toAbsolutePath().normalize().toString() : "";
                rows.add(id + "\t" + method.getDeclaringClass().getName() + "\t" + method.getName() + "\t" + origin);
            }
        }
        if (jobs.isEmpty()) return;
        Path dir = SessionDirectory.locate();
        rows.add(0, Paths.get("").toAbsolutePath().normalize().toString());
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/session", ex -> reply(ex, 200, session));
        server.createContext("/run/", this::run);
        server.start();
        rows.add(0, ManagementFactory.getRuntimeMXBean().getName());
        rows.add(0, secret); rows.add(0, String.valueOf(server.getAddress().getPort()));
        descriptor = dir.resolve("auto-" + session + ".jobs");
        Path pending = Files.createTempFile(dir, "publishing-", ".tmp");
        try {
            Files.write(pending, rows, StandardCharsets.UTF_8);
            Files.move(pending, descriptor, StandardCopyOption.ATOMIC_MOVE);
        } finally { Files.deleteIfExists(pending); }
        descriptor.toFile().deleteOnExit();
        LOG.info("Neo API 本地调试已就绪：" + jobs.size() + " 个定时任务");
    }
    private void run(HttpExchange ex) throws IOException {
        try {
            if (!"POST".equals(ex.getRequestMethod())) { reply(ex, 405, "POST required"); return; }
            // 配对凭据只走本机请求正文，不放在 URL、JVM 参数或应用日志中。
            byte[] proof = new byte[secret.length()]; DataInputStream input = new DataInputStream(ex.getRequestBody());
            try { input.readFully(proof); } catch (EOFException e) { reply(ex, 403, "not paired"); return; }
            if (!MessageDigest.isEqual(proof, secret.getBytes(StandardCharsets.UTF_8)) || input.read() != -1) { reply(ex, 403, "not paired"); return; }
            ScheduledMethodRunnable job = jobs.get(ex.getRequestURI().getPath().substring("/run/".length()));
            if (job == null) { reply(ex, 404, "unknown task"); return; }
            worker.execute(() -> {
                try { job.run(); LOG.info("手动执行完成：" + job.getMethod()); }
                catch (Throwable e) { LOG.log(Level.SEVERE, "手动执行失败：" + job.getMethod(), e); if(e instanceof Error) throw (Error)e; }
            });
            reply(ex, 202, "accepted");
        } finally { ex.close(); }
    }
    private static void reply(HttpExchange ex, int status, String text) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8); ex.sendResponseHeaders(status, body.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(body); }
    }
    private void close() {
        if (server != null) server.stop(0);
        worker.shutdown();
        try { if (descriptor != null) Files.deleteIfExists(descriptor); }
        catch (IOException e) { LOG.log(Level.WARNING, "未能清理任务连接信息", e); }
    }
}
