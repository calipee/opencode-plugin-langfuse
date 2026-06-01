import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LangfusePlugin } from "./index";

const mockForceFlush = mock(() => Promise.resolve());
const mockStart = mock(() => {});
const mockShutdown = mock(() => Promise.resolve());
const mockLangfuseSpanProcessor = mock(() => ({
  forceFlush: mockForceFlush,
}));

mock.module("@langfuse/otel", () => ({
  LangfuseSpanProcessor: mockLangfuseSpanProcessor,
}));

mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: mock(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  })),
}));

const mockLog = mock(() => {});

const createMockClient = () => ({
  app: {
    log: mockLog,
  },
});

const mockPluginInput = (clientOverrides = {}) =>
  ({
    client: { ...createMockClient(), ...clientOverrides },
    project: { id: "proj-123", worktree: "/test" },
    directory: "/test/dir",
    worktree: "/test/worktree",
    serverUrl: new URL("http://localhost:3000"),
    $: {},
  }) as any;

const missingCredentialsMessage =
  "Missing Langfuse credentials (set plugin publicKey/secretKey or LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY) - tracing disabled";
const openTelemetryDisabledMessage =
  "OpenTelemetry experimental feature is disabled in Opencode config - tracing disabled";

const configWithPluginOptions = (
  options: Record<string, unknown> = {},
  pluginSpecifier = "opencode-plugin-langfuse"
) =>
  ({
    experimental: { openTelemetry: true },
    plugin: [[pluginSpecifier, options]],
  }) as any;

describe("LangfusePlugin", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockForceFlush.mockClear();
    mockLangfuseSpanProcessor.mockClear();
    mockStart.mockClear();
    mockShutdown.mockClear();
    mockLog.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const setupEnv = (overrides: Record<string, string> = {}) => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    Object.assign(process.env, overrides);
  };

  describe("credentials", () => {
    it("keeps hooks disabled when credentials are missing", async () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;

      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!(configWithPluginOptions());

      expect(hooks.config).toBeDefined();
      expect(hooks.event).toBeDefined();
      expect(mockStart).not.toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message: missingCredentialsMessage,
        },
      });
    });

    it("returns hooks when credentials provided via env", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!({ experimental: { openTelemetry: true } } as any);

      expect(hooks.config).toBeDefined();
      expect(hooks.event).toBeDefined();
      expect(mockStart).toHaveBeenCalled();
      expect(mockLangfuseSpanProcessor).toHaveBeenCalledWith({
        publicKey: "pk-test",
        secretKey: "sk-test",
        baseUrl: "https://cloud.langfuse.com",
        environment: "development",
      });
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message: "OTEL tracing initialized → https://cloud.langfuse.com",
        },
      });
    });

    it("returns hooks when credentials provided via OpenCode plugin config", async () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;

      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!(
        configWithPluginOptions({
          publicKey: "pk-config",
          secretKey: "sk-config",
        })
      );

      expect(hooks.config).toBeDefined();
      expect(hooks.event).toBeDefined();
      expect(mockStart).toHaveBeenCalled();
      expect(mockLangfuseSpanProcessor).toHaveBeenCalledWith({
        publicKey: "pk-config",
        secretKey: "sk-config",
        baseUrl: "https://cloud.langfuse.com",
        environment: "development",
      });
    });

    it("reads plugin config from the langfuse tuple when other plugins are configured", async () => {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;

      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!({
        experimental: { openTelemetry: true },
        plugin: [
          "opencode-gemini-auth@latest",
          [
            "opencode-plugin-langfuse@latest",
            {
              publicKey: "pk-config",
              secretKey: "sk-config",
            },
          ],
        ],
      } as any);

      expect(mockStart).toHaveBeenCalled();
      expect(mockLangfuseSpanProcessor).toHaveBeenCalledWith({
        publicKey: "pk-config",
        secretKey: "sk-config",
        baseUrl: "https://cloud.langfuse.com",
        environment: "development",
      });
    });
  });

  describe("config hook", () => {
    it("warns when openTelemetry is disabled in config", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!({ experimental: { openTelemetry: false } } as any);

      expect(mockStart).not.toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message: openTelemetryDisabledMessage,
        },
      });
    });

    it("warns when experimental config is missing", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!({} as any);

      expect(mockStart).not.toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message: openTelemetryDisabledMessage,
        },
      });
    });

    it("does not warn when openTelemetry is enabled", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());
      mockLog.mockClear();

      await hooks.config!({ experimental: { openTelemetry: true } } as any);

      expect(mockLog).not.toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "warn",
          message: openTelemetryDisabledMessage,
        },
      });
    });
  });

  describe("event hook", () => {
    it("flushes OTEL spans on session.idle", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());
      await hooks.config!({ experimental: { openTelemetry: true } } as any);
      mockLog.mockClear();

      await hooks.event!({
        event: { type: "session.idle", properties: { sessionID: "sess-1" } },
      } as any);

      expect(mockForceFlush).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message: "Flushing OTEL spans before idle",
        },
      });
    });

    it("does not flush on other events", async () => {
      setupEnv();
      const hooks = await LangfusePlugin(mockPluginInput());
      await hooks.config!({ experimental: { openTelemetry: true } } as any);
      mockForceFlush.mockClear();

      await hooks.event!({
        event: {
          type: "session.created",
          properties: { info: { id: "sess-1" } },
        },
      } as any);

      expect(mockForceFlush).not.toHaveBeenCalled();
    });
  });

  describe("environment configuration", () => {
    it("uses default baseUrl when not provided", async () => {
      setupEnv();
      delete process.env.LANGFUSE_BASEURL;

      const hooks = await LangfusePlugin(mockPluginInput());
      await hooks.config!({ experimental: { openTelemetry: true } } as any);

      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message: "OTEL tracing initialized → https://cloud.langfuse.com",
        },
      });
    });

    it("uses custom baseUrl when provided", async () => {
      setupEnv({ LANGFUSE_BASEURL: "https://custom.langfuse.com" });

      const hooks = await LangfusePlugin(mockPluginInput());
      await hooks.config!({ experimental: { openTelemetry: true } } as any);

      expect(mockLog).toHaveBeenCalledWith({
        body: {
          service: "langfuse-otel",
          level: "info",
          message: "OTEL tracing initialized → https://custom.langfuse.com",
        },
      });
    });

    it("prefers OpenCode plugin config over environment variables", async () => {
      setupEnv({
        LANGFUSE_BASEURL: "https://env.langfuse.com",
        LANGFUSE_ENVIRONMENT: "env",
      });

      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!(
        configWithPluginOptions({
          publicKey: "pk-config",
          secretKey: "sk-config",
          baseUrl: "https://config.langfuse.com",
          environment: "production",
        })
      );

      expect(mockLangfuseSpanProcessor).toHaveBeenCalledWith({
        publicKey: "pk-config",
        secretKey: "sk-config",
        baseUrl: "https://config.langfuse.com",
        environment: "production",
      });
    });

    it("accepts baseURL as an alias for baseUrl", async () => {
      setupEnv();

      const hooks = await LangfusePlugin(mockPluginInput());

      await hooks.config!(
        configWithPluginOptions({
          baseURL: "https://alias.langfuse.com",
        })
      );

      expect(mockLangfuseSpanProcessor).toHaveBeenCalledWith({
        publicKey: "pk-test",
        secretKey: "sk-test",
        baseUrl: "https://alias.langfuse.com",
        environment: "development",
      });
    });
  });
});
