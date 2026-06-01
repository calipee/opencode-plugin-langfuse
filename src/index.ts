import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { NodeSDK } from "@opentelemetry/sdk-node";

const PLUGIN_NAME = "opencode-plugin-langfuse";

type LangfuseConnectionOptions = {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  baseURL?: string;
  environment?: string;
};

const asConfigString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLangfusePluginSpecifier = (value: unknown) => {
  const specifier = asConfigString(value);
  if (!specifier) return false;

  return (
    specifier === PLUGIN_NAME ||
    specifier.startsWith(`${PLUGIN_NAME}@`) ||
    specifier.includes(`/${PLUGIN_NAME}`) ||
    specifier.includes(`/${PLUGIN_NAME}@`)
  );
};

const resolveConnectionOptions = (options: Record<string, unknown> = {}) => {
  const langfuse = options as LangfuseConnectionOptions;

  return {
    publicKey:
      asConfigString(langfuse.publicKey) ?? process.env.LANGFUSE_PUBLIC_KEY,
    secretKey:
      asConfigString(langfuse.secretKey) ?? process.env.LANGFUSE_SECRET_KEY,
    baseUrl:
      asConfigString(langfuse.baseUrl) ??
      asConfigString(langfuse.baseURL) ??
      process.env.LANGFUSE_BASEURL ??
      "https://cloud.langfuse.com",
    environment:
      asConfigString(langfuse.environment) ??
      process.env.LANGFUSE_ENVIRONMENT ??
      "development",
  };
};

const readConfigOptions = (config: { plugin?: unknown }) => {
  if (!Array.isArray(config.plugin)) return {};

  for (const plugin of config.plugin) {
    if (!Array.isArray(plugin)) continue;
    if (!isLangfusePluginSpecifier(plugin[0])) continue;

    return isRecord(plugin[1]) ? plugin[1] : {};
  }

  return {};
};

const createLangfusePlugin = async (
  { client }: PluginInput,
  initialOptions: Record<string, unknown> = {}
): Promise<Hooks> => {
  let processor: LangfuseSpanProcessor | undefined;
  let sdk: NodeSDK | undefined;
  let warnedAboutMissingCredentials = false;

  const log = (level: "info" | "warn" | "error", message: string) => {
    client.app.log({
      body: { service: "langfuse-otel", level, message },
    });
  };

  const startTracing = (options: Record<string, unknown>) => {
    if (sdk) return;

    const { publicKey, secretKey, baseUrl, environment } =
      resolveConnectionOptions(options);

    if (!publicKey || !secretKey) {
      if (!warnedAboutMissingCredentials) {
        warnedAboutMissingCredentials = true;
        log(
          "warn",
          "Missing Langfuse credentials (set plugin publicKey/secretKey or LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY) - tracing disabled"
        );
      }
      return;
    }

    processor = new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl,
      environment,
    });

    sdk = new NodeSDK({
      spanProcessors: [processor],
    });

    sdk.start();
    log("info", `OTEL tracing initialized → ${baseUrl}`);
  };

  return {
    config: async (config) => {
      if (!config.experimental?.openTelemetry) {
        log(
          "warn",
          "OpenTelemetry experimental feature is disabled in Opencode config - tracing disabled"
        );
        return;
      }

      startTracing({
        ...initialOptions,
        ...readConfigOptions(config),
      });
    },
    event: async ({ event }) => {
      if (event.type === "session.idle" && processor) {
        log("info", "Flushing OTEL spans before idle");
        await processor.forceFlush(); // Flushes the trace to Langfuse
      }

      if (event.type === "server.instance.disposed" && sdk) {
        await sdk.shutdown(); // Flushes the trace to Langfuse
        sdk = undefined;
        processor = undefined;
      }
    },
  };
};

export const LangfusePlugin = createLangfusePlugin as Plugin;
