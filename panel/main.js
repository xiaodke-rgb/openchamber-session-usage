"use strict";
(() => {
  // node_modules/@openchamber/sdk/dist/api-version.js
  var OPENCHAMBER_SDK_CHANNEL = "openchamber.sdk";
  var OPENCHAMBER_SDK_API_VERSION = 1;

  // node_modules/@openchamber/sdk/dist/scrollbar-style.js
  var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
  var GUEST_SCROLLBAR_CSS = `
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
  function installGuestScrollbarActivity(doc) {
    const root2 = doc.documentElement;
    if (root2.hasAttribute("data-oc-scrollbar-activity"))
      return;
    root2.setAttribute("data-oc-scrollbar-activity", "");
    const timers = /* @__PURE__ */ new WeakMap();
    doc.addEventListener("scroll", (event) => {
      const target = event.target === doc ? root2 : event.target;
      if (!(target instanceof Element))
        return;
      if (!target.hasAttribute("data-oc-scrolling"))
        target.setAttribute("data-oc-scrolling", "");
      const pending = timers.get(target);
      if (pending !== void 0)
        clearTimeout(pending);
      timers.set(target, setTimeout(() => {
        timers.delete(target);
        target.removeAttribute("data-oc-scrolling");
      }, 1e3));
    }, { capture: true, passive: true });
  }
  var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;

  // node_modules/@openchamber/sdk/dist/workspace.js
  var GUEST_STORAGE_KEY_MAX = 128;
  var GUEST_STORAGE_VALUE_BYTES = 65536;

  // node_modules/@openchamber/sdk/dist/shells.js
  var GUEST_SHELL_ID_MAX = 128;
  var GUEST_SHELL_OUTPUT_TAIL_MAX = 65536;

  // node_modules/@openchamber/sdk/dist/status-controls.js
  var GUEST_STATUS_CONTROLS_MAX = 4;
  var GUEST_STATUS_CONTROL_ID = /^[a-z][a-z0-9-]{0,39}$/;
  var GUEST_STATUS_CONTROL_LABEL_MAX = 60;
  var GUEST_STATUS_CONTROL_OPTIONS_MAX = 16;
  var GUEST_STATUS_CONTROL_VALUE_MAX = 80;
  var isControlObject = (value) => Object(value) === value && !Array.isArray(value);
  var hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
  var isLabel = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_LABEL_MAX;
  var isValue = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_VALUE_MAX;
  var isGuestStatusControls = (controls) => {
    if (!Array.isArray(controls) || controls.length > GUEST_STATUS_CONTROLS_MAX)
      return false;
    const ids = /* @__PURE__ */ new Set();
    for (const control of controls) {
      if (!isControlObject(control) || !GUEST_STATUS_CONTROL_ID.test(control.id) || !isLabel(control.label))
        return false;
      if (control.disabled !== void 0 && control.disabled !== true && control.disabled !== false)
        return false;
      if (ids.has(control.id))
        return false;
      ids.add(control.id);
      if (control.kind === "button") {
        if (!hasOnlyKeys(control, ["kind", "id", "label", "disabled"]))
          return false;
        continue;
      }
      if (control.kind !== "select" || !hasOnlyKeys(control, ["kind", "id", "label", "value", "options", "disabled"]))
        return false;
      if (!isValue(control.value) || !Array.isArray(control.options) || control.options.length < 1 || control.options.length > GUEST_STATUS_CONTROL_OPTIONS_MAX)
        return false;
      const values = /* @__PURE__ */ new Set();
      for (const option of control.options) {
        if (!isControlObject(option) || !hasOnlyKeys(option, ["value", "label"]) || !isValue(option.value) || !isLabel(option.label) || values.has(option.value))
          return false;
        values.add(option.value);
      }
      if (!values.has(control.value))
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/file-editor.js
  var GUEST_FILE_EDITOR_CONTENT_MAX = 2e7;
  var GUEST_FILE_EDITOR_VERSION_MAX = 256;
  var fileEditorPayloadSize = (value) => "bytes" in value ? value.bytes.byteLength : value.content.length;
  var sameFileEditorDocument = (left, right) => {
    if (left.path !== right.path || left.readOnly !== right.readOnly)
      return false;
    if (left.encoding === "text" || right.encoding === "text") {
      return left.encoding === "text" && right.encoding === "text" && left.content === right.content;
    }
    if (left.bytes.byteLength !== right.bytes.byteLength)
      return false;
    for (let index = 0; index < left.bytes.byteLength; index += 1) {
      if (left.bytes[index] !== right.bytes[index])
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/popover.js
  var GUEST_POPOVER_ID = /^[A-Za-z0-9_-]{1,80}$/;
  var GUEST_POPOVER_COORDINATE_MAX = 1e5;
  var GUEST_POPOVER_WIDTH_MIN = 160;
  var GUEST_POPOVER_WIDTH_MAX = 640;
  var GUEST_POPOVER_HEIGHT_MIN = 48;
  var GUEST_POPOVER_HEIGHT_MAX = 480;
  var GUEST_POPOVER_DATA_MAX = 16e3;
  var GUEST_POPOVER_DATA_DEPTH_MAX = 32;
  var GUEST_POPOVER_SIDES = ["left", "right", "top", "bottom"];
  var hasBoundedJsonTree = (value, depth = 0, budget = { remaining: GUEST_POPOVER_DATA_MAX }) => {
    if (--budget.remaining < 0 || depth >= GUEST_POPOVER_DATA_DEPTH_MAX)
      return false;
    if (value === null)
      return true;
    const children = Array.isArray(value) ? value : Object(value) === value ? Object.values(value) : [];
    for (const item of children) {
      if (!hasBoundedJsonTree(item, depth + 1, budget))
        return false;
    }
    return true;
  };
  var isFiniteJson = (value) => {
    if (value === null || value === true || value === false)
      return true;
    if (Array.isArray(value))
      return Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) && value.every(isFiniteJson);
    if (Object(value) === value) {
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype) && Object.values(value).every(isFiniteJson);
    }
    return String(value) === value || Number.isFinite(value);
  };
  var isGuestPopoverRequest = (request) => {
    try {
      if (String(request.id) !== request.id || !GUEST_POPOVER_ID.test(request.id) || !Number.isFinite(request.anchor.x) || Math.abs(request.anchor.x) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.y) || Math.abs(request.anchor.y) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.width) || !Number.isFinite(request.anchor.height) || request.anchor.width <= 0 || request.anchor.height <= 0 || request.anchor.width > GUEST_POPOVER_COORDINATE_MAX || request.anchor.height > GUEST_POPOVER_COORDINATE_MAX || !Number.isInteger(request.width) || request.width < GUEST_POPOVER_WIDTH_MIN || request.width > GUEST_POPOVER_WIDTH_MAX || !Number.isInteger(request.height) || request.height < GUEST_POPOVER_HEIGHT_MIN || request.height > GUEST_POPOVER_HEIGHT_MAX || request.side !== void 0 && !GUEST_POPOVER_SIDES.includes(request.side) || request.focus !== void 0 && request.focus !== true && request.focus !== false || !hasBoundedJsonTree(request.data) || !isFiniteJson(request.data))
        return false;
      return JSON.stringify(request.data).length <= GUEST_POPOVER_DATA_MAX;
    } catch {
      return false;
    }
  };

  // node_modules/@openchamber/sdk/dist/contract.js
  var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
  var isStartSessionResult = (value) => Boolean(value && "sessionId" in value);
  var isPromptResult = (value) => Boolean(value && "sent" in value && !("sessionId" in value));
  var GUEST_COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
  var isGuestCommitSha = (value) => GUEST_COMMIT_SHA.test(value);
  var GUEST_TOAST_MAX = 500;
  var GUEST_CLIPBOARD_TEXT_MAX = 32e3;
  var GUEST_COMPOSE_TEXT_MAX = 16e3;
  var GUEST_ATTACH_ID_MAX = 128;
  var GUEST_ATTACH_TITLE_MAX = 200;
  var GUEST_ATTACH_URL_MAX = 2e3;
  var GUEST_ATTACH_TEXT_MAX = 16e3;
  var GUEST_ATTACH_AUTHOR_MAX = 80;
  var GUEST_ATTACH_BRANCH_MAX = 200;
  var GUEST_ATTACH_DATA_MAX = 16e3;
  var GUEST_REQUEST_PATH_MAX = 2e3;
  var GUEST_REQUEST_TIMEOUT_MS = 2e4;
  var GUEST_FILE_PATH_MAX = 1024;
  var GUEST_FILE_CONTENT_MAX = 2e6;
  var GUEST_GENERATE_PROMPT_MAX = 64e3;
  var GUEST_GENERATE_SYSTEM_MAX = 8e3;
  var GUEST_GENERATE_OUTPUT_TOKENS_MAX = 4e3;
  var GUEST_GENERATE_TIMEOUT_MS = 9e4;
  var GUEST_BADGE_MAX = 999;
  var GUEST_FRAME_HEIGHT_MAX = 1e4;
  var GUEST_RESOLVE_ERROR_MAX = 500;
  var HOST_REQUEST_ERROR_CODES = [
    "HOST_UNAVAILABLE",
    "HOST_TIMEOUT",
    "HOST_REJECTED",
    "DISCONNECTED",
    "DISABLED",
    "BAD_PATH",
    "NO_INTEGRATION",
    "NO_SERVICE",
    "SERVICE_FAILED",
    "REQUEST_FAILED",
    "RESPONSE_TOO_LARGE",
    "NO_SESSION",
    "SESSION_BUSY",
    "NOT_GRANTED",
    "NO_DIRECTORY",
    "NOT_FOUND",
    "FILE_TOO_LARGE",
    "DENIED",
    "NO_MODEL",
    "MODEL_FAILED",
    "UNSUPPORTED"
  ];
  var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
  var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
  var isHostRequestErrorCode = (value) => hostRequestErrorCodeSet.has(value);
  var resolveHostRequestErrorCode = (value) => value && isHostRequestErrorCode(value) ? value : "HOST_REJECTED";
  var isJsonValue = (value) => {
    if (value === void 0)
      return false;
    if (value === null || value === true || value === false)
      return true;
    if (String(value) === value)
      return true;
    if (Number(value) === value)
      return Number.isFinite(value);
    if (Array.isArray(value))
      return value.every(isJsonValue);
    if (Object(value) === value)
      return Object.values(value).every(isJsonValue);
    return false;
  };
  var isAttachData = (value) => isJsonValue(value) && JSON.stringify(value).length <= GUEST_ATTACH_DATA_MAX;
  var clampBranch = (value) => value?.trim().slice(0, GUEST_ATTACH_BRANCH_MAX) ?? "";
  var clampAttachRequest = (request) => {
    const id = request.id.trim().slice(0, GUEST_ATTACH_ID_MAX);
    const title = request.title.trim().slice(0, GUEST_ATTACH_TITLE_MAX);
    const url = request.url.trim().slice(0, GUEST_ATTACH_URL_MAX);
    const text = request.text?.trim().slice(0, GUEST_ATTACH_TEXT_MAX);
    const author = request.author?.trim().slice(0, GUEST_ATTACH_AUTHOR_MAX);
    const kind = request.kind === "pull" ? "pull" : "issue";
    const next = {
      providerId: request.providerId.trim(),
      id,
      title: title || id,
      url,
      kind
    };
    if (text) {
      next.text = text;
    }
    if (author) {
      next.author = author;
    }
    if (kind === "pull") {
      const head = clampBranch(request.branches?.head);
      const base = clampBranch(request.branches?.base);
      if (head && base) {
        next.branches = { head, base };
      }
    }
    if (isAttachData(request.data)) {
      next.data = request.data;
    }
    return next;
  };
  var clampStartSessionRequest = (request) => {
    const next = clampAttachRequest(request);
    if (request.projectId)
      next.projectId = request.projectId;
    if (request.navigation)
      next.navigation = request.navigation;
    if (request.worktree) {
      next.worktree = request.worktree;
    }
    return next;
  };
  var clampPromptRequest = (request) => {
    const next = {
      text: request.text.trim().slice(0, GUEST_COMPOSE_TEXT_MAX)
    };
    if (request.send) {
      next.send = true;
    }
    return next;
  };
  var clampBadgeCount = (count) => {
    if (count === null || !Number.isFinite(count))
      return null;
    return Math.min(GUEST_BADGE_MAX, Math.max(0, Math.round(count)));
  };
  var clampFrameHeight = (height) => {
    if (!Number.isFinite(height))
      return 0;
    return Math.min(GUEST_FRAME_HEIGHT_MAX, Math.max(0, Math.ceil(height)));
  };
  var isGuestFilePath = (value) => value.length > 0 && value.length <= GUEST_FILE_PATH_MAX && !value.includes("\0") && !value.includes("\\");
  var isGuestRequestPath = (value) => {
    if (!value.startsWith("/") || value.includes("\0") || value.includes("\\") || value.includes("://")) {
      return false;
    }
    if (value.length > GUEST_REQUEST_PATH_MAX) {
      return false;
    }
    const segments = value.split("/");
    return !segments.some((segment) => segment === "." || segment === "..");
  };
  var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
  var isServiceStatusResult = (value) => Boolean(value && "status" in value && serviceStatusSet.has(String(value.status)) && !("body" in value));
  var isGuestRequestResult = (value) => Boolean(value && "status" in value && "body" in value && Number.isInteger(value.status));
  var isFileReadResult = (value) => Boolean(value && "content" in value && String(value.content) === value.content);
  var isFileWriteResult = (value) => Boolean(value && "written" in value && value.written === true);
  var isFileListResult = (value) => Boolean(value && "entries" in value && Array.isArray(value.entries));
  var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
  var isFileStatResult = (value) => Boolean(value && "kind" in value && "size" in value && fileStatKindSet.has(String(value.kind)) && Number.isFinite(value.size));
  var isGenerateResult = (value) => Boolean(value && "text" in value && String(value.text) === value.text && !("status" in value));
  var HOST_PUSH_TYPES = /* @__PURE__ */ new Set([
    "workspace",
    "shells",
    "ready",
    "directory",
    "session",
    "connection",
    "settings",
    "session-lifecycle",
    "item",
    "resolve",
    "action",
    "status-control-event",
    "popover-closed",
    "file-open",
    "file-snapshot",
    "file-saved"
  ]);
  var asWireRecord = (data) => Object(data) === data ? data : null;
  var isNonEmptyString = (value) => String(value) === value && value.length > 0;
  var readResultMessage = (wire) => {
    if (!isNonEmptyString(wire.id))
      return null;
    if (wire.ok === true) {
      const message = {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: true
      };
      if (Object(wire.payload) === wire.payload) {
        message.payload = wire.payload;
      }
      return message;
    }
    if (wire.ok === false && isNonEmptyString(wire.error)) {
      return {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: false,
        error: wire.error,
        code: resolveHostRequestErrorCode(isNonEmptyString(wire.code) ? wire.code : void 0)
      };
    }
    return null;
  };
  var readHostMessage = (data) => {
    const wire = asWireRecord(data);
    if (!wire || wire.channel !== OPENCHAMBER_SDK_CHANNEL || wire.v !== OPENCHAMBER_SDK_API_VERSION)
      return null;
    if (wire.type === "result")
      return readResultMessage(wire);
    if (!HOST_PUSH_TYPES.has(String(wire.type)) || Object(wire.payload) !== wire.payload)
      return null;
    return wire;
  };

  // node_modules/@openchamber/sdk/dist/host.js
  var isKeyEvent = (event) => "key" in event && "metaKey" in event && "ctrlKey" in event;
  var isSaveShortcut = (event) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";
  var HostRequestError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "HostRequestError";
      this.code = code;
    }
  };
  var rejectBadPath = () => Promise.reject(new HostRequestError("BAD_PATH", 'Request path must start with "/" and stay on the declared origin.'));
  var rejectBadFilePath = () => Promise.reject(new HostRequestError("BAD_PATH", `File path must be 1 to ${GUEST_FILE_PATH_MAX} characters without NUL or backslash.`));
  var deviceStorageScope = (options) => {
    if (options === void 0)
      return void 0;
    if (Object(options) !== options || Array.isArray(options) || options.scope !== void 0 && options.scope !== "instance" && options.scope !== "device") {
      throw new HostRequestError("HOST_REJECTED", 'Storage scope must be "instance" or "device".');
    }
    return options.scope === "device" ? "device" : void 0;
  };
  var nextId = (n) => {
    n.value += 1;
    return `oc-${n.value}`;
  };
  var connectHost = (options = {}) => {
    const target = options.target ?? ("window" in globalThis ? window : null);
    if (!target) {
      throw new HostRequestError("HOST_UNAVAILABLE", "No window. connectHost runs in a browser frame.");
    }
    const acceptSource = options.acceptSource ?? ((source) => source === target.parent);
    const requestTimeoutMs = options.requestTimeoutMs ?? GUEST_REQUEST_TIMEOUT_MS;
    const readyListeners = /* @__PURE__ */ new Set();
    const directoryListeners = /* @__PURE__ */ new Set();
    const sessionListeners = /* @__PURE__ */ new Set();
    const lifecycleListeners = /* @__PURE__ */ new Set();
    const connectionListeners = /* @__PURE__ */ new Set();
    const settingsListeners = /* @__PURE__ */ new Set();
    const itemListeners = /* @__PURE__ */ new Set();
    const statusControlListeners = /* @__PURE__ */ new Set();
    const popoverClosedListeners = /* @__PURE__ */ new Set();
    let resolveHandler = null;
    let actionHandler = null;
    const fileOpenListeners = /* @__PURE__ */ new Set();
    const fileSavedListeners = /* @__PURE__ */ new Set();
    let fileSnapshotHandler = null;
    let lastFile = null;
    let saveShortcutInstalled = false;
    const pending = /* @__PURE__ */ new Map();
    const workspaceListeners = /* @__PURE__ */ new Map();
    const shellsListeners = /* @__PURE__ */ new Map();
    let disposed = false;
    const ids = { value: 0 };
    let lastReady = null;
    let lastLifecycle = null;
    let popoverPointerActive = false;
    let popoverFocusActive = false;
    let popoverActivityReported = null;
    const lifecycleFromSession = (session) => {
      if (!session)
        return null;
      return {
        sessionId: session.id,
        phase: session.busy ? "started" : "completed"
      };
    };
    const post = (message) => {
      target.parent.postMessage(message, "*");
    };
    const emit = (listeners, value) => {
      for (const listener of listeners) {
        try {
          listener(value);
        } catch (error) {
          console.error(error);
        }
      }
    };
    const onMessage = (event) => {
      if (!(event instanceof MessageEvent))
        return;
      if (!acceptSource(event.source))
        return;
      const message = readHostMessage(event.data);
      if (!message)
        return;
      if (message.type === "workspace") {
        const listener = workspaceListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "shells") {
        const listener = shellsListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "ready") {
        lastReady = message.payload;
        lastLifecycle = lifecycleFromSession(message.payload.session);
        emit(readyListeners, message.payload);
        emit(directoryListeners, message.payload.directory);
        emit(sessionListeners, message.payload.session);
        if (lastLifecycle) {
          emit(lifecycleListeners, lastLifecycle);
        }
        emit(connectionListeners, message.payload.connection);
        emit(settingsListeners, message.payload.settings);
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "directory") {
        if (lastReady) {
          lastReady = { ...lastReady, directory: message.payload.directory };
        }
        emit(directoryListeners, message.payload.directory);
        return;
      }
      if (message.type === "session") {
        if (lastReady) {
          lastReady = { ...lastReady, session: message.payload.session };
        }
        if (!message.payload.session) {
          lastLifecycle = null;
        } else if (lastLifecycle?.sessionId !== message.payload.session.id) {
          lastLifecycle = lifecycleFromSession(message.payload.session);
        }
        emit(sessionListeners, message.payload.session);
        return;
      }
      if (message.type === "session-lifecycle") {
        lastLifecycle = message.payload;
        emit(lifecycleListeners, message.payload);
        return;
      }
      if (message.type === "connection") {
        if (lastReady) {
          lastReady = { ...lastReady, connection: message.payload.connection };
        }
        emit(connectionListeners, message.payload.connection);
        return;
      }
      if (message.type === "settings") {
        if (lastReady) {
          lastReady = { ...lastReady, settings: message.payload.settings };
        }
        emit(settingsListeners, message.payload.settings);
        return;
      }
      if (message.type === "item") {
        if (lastReady) {
          lastReady = { ...lastReady, item: message.payload.item };
        }
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "status-control-event") {
        emit(statusControlListeners, message.payload);
        return;
      }
      if (message.type === "popover-closed") {
        emit(popoverClosedListeners, message.payload);
        return;
      }
      if (message.type === "action") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "action-result",
              id: message.id,
              payload
            });
        };
        const handler = actionHandler;
        if (!handler) {
          answer({ ok: false, error: "This extension does not handle background actions." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then(() => answer({ ok: true }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ ok: false, error: (text || "Action failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      if (message.type === "file-open") {
        const next = message.payload;
        if (lastFile && sameFileEditorDocument(lastFile, next))
          return;
        lastFile = next;
        emit(fileOpenListeners, message.payload);
        return;
      }
      if (message.type === "file-saved") {
        emit(fileSavedListeners, message.payload.version);
        return;
      }
      if (message.type === "file-snapshot") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "file-snapshot-result",
              id: message.id,
              payload
            });
        };
        const fail = (text) => answer({ error: (text.trim() || "Could not read the edited file.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        const handler = fileSnapshotHandler;
        if (!handler) {
          fail("This extension does not edit files.");
          return;
        }
        Promise.resolve().then(() => handler(message.payload.purpose)).then((snapshot) => {
          if (fileEditorPayloadSize(snapshot) > GUEST_FILE_EDITOR_CONTENT_MAX) {
            fail(`The file is over ${GUEST_FILE_EDITOR_CONTENT_MAX} ${"bytes" in snapshot ? "bytes" : "characters"}.`);
            return;
          }
          if (snapshot.version.length > GUEST_FILE_EDITOR_VERSION_MAX) {
            fail(`The snapshot version is over ${GUEST_FILE_EDITOR_VERSION_MAX} characters.`);
            return;
          }
          answer({ snapshot: "bytes" in snapshot ? { bytes: snapshot.bytes, version: snapshot.version } : { content: snapshot.content, version: snapshot.version } });
        }, (error) => fail(error instanceof Error ? error.message : String(error)));
        return;
      }
      if (message.type === "resolve") {
        const answer = (payload) => {
          post({
            channel: OPENCHAMBER_SDK_CHANNEL,
            v: OPENCHAMBER_SDK_API_VERSION,
            type: "resolve-result",
            id: message.id,
            payload
          });
        };
        const handler = resolveHandler;
        if (!handler) {
          answer({ error: "This extension does not resolve commands." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then((item) => answer({ item: item ? clampAttachRequest(item) : null }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ error: (text || "Command failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter)
        return;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      if (message.ok) {
        waiter.resolve(message.payload);
        return;
      }
      waiter.reject(new HostRequestError(message.code, message.error));
    };
    target.addEventListener("message", onMessage);
    post({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: "hello"
    });
    const send = (message, timeoutMs = requestTimeoutMs) => {
      if (disposed || target.parent === target) {
        return Promise.reject(new HostRequestError("HOST_UNAVAILABLE", "No host frame. This page is not in an iframe."));
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new HostRequestError("HOST_TIMEOUT", "Host did not answer in time."));
        }, timeoutMs);
        pending.set(message.id, { resolve, reject, timer });
        post(message);
      });
    };
    const request = (message) => send(message).then(() => void 0);
    const envelope = { channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION };
    const notify = (message) => {
      if (!disposed && target.parent !== target)
        post(message);
    };
    const requestFileSave = () => notify({ ...envelope, type: "file-save" });
    const onSaveShortcut = (event) => {
      if (!isKeyEvent(event) || !isSaveShortcut(event))
        return;
      event.preventDefault();
      requestFileSave();
    };
    const onPopoverEscape = (event) => {
      if (!isKeyEvent(event) || event.key !== "Escape" || lastReady?.surface !== "popover" || !lastReady.popover)
        return;
      event.preventDefault();
      void closePopover(lastReady.popover.id, "escape").catch(() => void 0);
    };
    const reportPopoverActivity = () => {
      const popover = lastReady?.surface === "popover" ? lastReady.popover : void 0;
      if (!popover)
        return;
      const active2 = popoverPointerActive || popoverFocusActive;
      if (popoverActivityReported === active2)
        return;
      popoverActivityReported = active2;
      void setPopoverAnchorActive(popover.id, active2).catch(() => void 0);
    };
    const onPopoverPointerOver = () => {
      if (lastReady?.surface !== "popover" || popoverPointerActive)
        return;
      popoverPointerActive = true;
      reportPopoverActivity();
    };
    const onPopoverPointerOut = (event) => {
      if (lastReady?.surface !== "popover" || event.relatedTarget !== null || !popoverPointerActive)
        return;
      popoverPointerActive = false;
      reportPopoverActivity();
    };
    const onPopoverFocus = () => {
      if (lastReady?.surface !== "popover" || popoverFocusActive)
        return;
      popoverFocusActive = true;
      reportPopoverActivity();
    };
    const onPopoverBlur = () => {
      if (lastReady?.surface !== "popover" || !popoverFocusActive)
        return;
      popoverFocusActive = false;
      reportPopoverActivity();
    };
    const requireIdentity = (value, maximum = 1024) => {
      if (!value.trim() || value.length > maximum)
        throw new HostRequestError("HOST_REJECTED", `Identity must contain 1 to ${maximum} characters.`);
    };
    const readWorkspace = async (query) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const result = await send({ ...envelope, type: "workspace-read", id: nextId(ids), payload: query });
      if (!result || !("kind" in result) || !("state" in result) || result.kind !== query.kind) {
        throw new HostRequestError("HOST_REJECTED", "Host did not return workspace data.");
      }
      return result;
    };
    const subscribeWorkspace = async (query, listener) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const subscriptionId = nextId(ids);
      workspaceListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "workspace-subscribe", id: nextId(ids), payload: { subscriptionId, query } });
      } catch (error) {
        workspaceListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!workspaceListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const subscribeShells = async (scope2, listener) => {
      if (scope2.kind === "session")
        requireIdentity(scope2.sessionId);
      if (scope2.kind === "project")
        requireIdentity(scope2.projectId);
      const subscriptionId = nextId(ids);
      shellsListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "shells-subscribe", id: nextId(ids), payload: { subscriptionId, scope: scope2 } });
      } catch (error) {
        shellsListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!shellsListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const storage = async (payload) => {
      if ("key" in payload && (payload.key.length === 0 || payload.key.length > GUEST_STORAGE_KEY_MAX)) {
        throw new HostRequestError("HOST_REJECTED", "Storage key must contain 1 to 128 characters.");
      }
      if (payload.op === "set" && !isJsonValue(payload.value)) {
        throw new HostRequestError("HOST_REJECTED", "Storage values must be JSON.");
      }
      if (payload.op === "set" && new TextEncoder().encode(JSON.stringify(payload.value)).length > GUEST_STORAGE_VALUE_BYTES) {
        throw new HostRequestError("HOST_REJECTED", "Storage value exceeds 64 KiB.");
      }
      if (payload.scope === "device" && lastReady?.features?.deviceStorage !== true) {
        throw new HostRequestError("UNSUPPORTED", "This host does not support device storage.");
      }
      const result = await send({ ...envelope, type: "storage", id: nextId(ids), payload });
      if (!result || !("storage" in result) || result.op !== payload.op)
        throw new HostRequestError("HOST_REJECTED", "Host did not return storage data.");
      return result;
    };
    const closePopover = (id, reason) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-close", id: nextId(ids), payload: reason ? { id, reason } : { id } });
    const setPopoverAnchorActive = (id, active2) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-anchor", id: nextId(ids), payload: { id, active: active2 } });
    target.addEventListener("keydown", onPopoverEscape, true);
    target.addEventListener("pointerover", onPopoverPointerOver);
    target.addEventListener("pointermove", onPopoverPointerOver);
    target.addEventListener("pointerout", onPopoverPointerOut);
    target.addEventListener("focus", onPopoverFocus);
    target.addEventListener("blur", onPopoverBlur);
    return {
      onAction: (handler) => {
        actionHandler = handler;
        return () => {
          if (actionHandler === handler)
            actionHandler = null;
        };
      },
      listProjects: async () => {
        const result = await readWorkspace({ kind: "projects" });
        if (result.kind !== "projects")
          throw new HostRequestError("HOST_REJECTED", "Expected projects.");
        return result;
      },
      listWorktrees: async (projectId) => {
        const result = await readWorkspace({ kind: "worktrees", projectId });
        if (result.kind !== "worktrees")
          throw new HostRequestError("HOST_REJECTED", "Expected worktrees.");
        return result;
      },
      listSessions: async (projectId) => {
        const result = await readWorkspace({ kind: "sessions", projectId });
        if (result.kind !== "sessions")
          throw new HostRequestError("HOST_REJECTED", "Expected sessions.");
        return result;
      },
      onProjects: (listener) => subscribeWorkspace({ kind: "projects" }, (snapshot) => {
        if (snapshot.kind === "projects")
          listener(snapshot);
      }),
      onWorktrees: (projectId, listener) => subscribeWorkspace({ kind: "worktrees", projectId }, (snapshot) => {
        if (snapshot.kind === "worktrees")
          listener(snapshot);
      }),
      onSessions: (projectId, listener) => subscribeWorkspace({ kind: "sessions", projectId }, (snapshot) => {
        if (snapshot.kind === "sessions")
          listener(snapshot);
      }),
      onRunningShells: (scope2, listener) => subscribeShells(scope2, listener),
      readShellOutput: async (shellId, options2) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const cursor = options2?.cursor;
        if (cursor !== void 0 && (!Number.isInteger(cursor) || cursor < 0)) {
          throw new HostRequestError("HOST_REJECTED", "Shell output cursor must be a non-negative integer.");
        }
        const tailBytes = options2?.tailBytes;
        if (tailBytes !== void 0 && (!Number.isInteger(tailBytes) || tailBytes < 1 || tailBytes > GUEST_SHELL_OUTPUT_TAIL_MAX)) {
          throw new HostRequestError("HOST_REJECTED", `Shell output tailBytes must be an integer between 1 and ${GUEST_SHELL_OUTPUT_TAIL_MAX}.`);
        }
        const result = await send({ ...envelope, type: "shell-output", id: nextId(ids), payload: { shellId, cursor, tailBytes } });
        const output = result;
        if (!output || typeof output.output !== "string" || !Number.isFinite(output.cursor)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return shell output.");
        }
        return output;
      },
      stopShell: async (shellId) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const result = await send({ ...envelope, type: "shell-stop", id: nextId(ids), payload: { shellId } });
        if (result?.stopped !== true)
          throw new HostRequestError("HOST_REJECTED", "Host did not stop the shell.");
        return { stopped: true };
      },
      openSession: async (sessionId2) => {
        requireIdentity(sessionId2);
        await request({ ...envelope, type: "open-session", id: nextId(ids), payload: { sessionId: sessionId2 } });
      },
      storage: {
        get: async (key, options2) => {
          const scope2 = deviceStorageScope(options2);
          const payload = { op: "get", key };
          if (scope2)
            payload.scope = scope2;
          const result = await storage(payload);
          return result.op === "get" && result.found ? result.value : void 0;
        },
        set: async (key, value, options2) => {
          const scope2 = deviceStorageScope(options2);
          const payload = { op: "set", key, value };
          if (scope2)
            payload.scope = scope2;
          await storage(payload);
        },
        delete: async (key, options2) => {
          const scope2 = deviceStorageScope(options2);
          const payload = { op: "delete", key };
          if (scope2)
            payload.scope = scope2;
          await storage(payload);
        },
        keys: async (options2) => {
          const scope2 = deviceStorageScope(options2);
          const payload = { op: "keys" };
          if (scope2)
            payload.scope = scope2;
          const result = await storage(payload);
          if (result.op !== "keys")
            throw new HostRequestError("HOST_REJECTED", "Expected storage keys.");
          return result.keys;
        }
      },
      onReady: (listener) => {
        readyListeners.add(listener);
        if (lastReady)
          listener(lastReady);
        return () => {
          readyListeners.delete(listener);
        };
      },
      onDirectory: (listener) => {
        directoryListeners.add(listener);
        if (lastReady)
          listener(lastReady.directory);
        return () => {
          directoryListeners.delete(listener);
        };
      },
      onSession: (listener) => {
        sessionListeners.add(listener);
        if (lastReady)
          listener(lastReady.session);
        return () => {
          sessionListeners.delete(listener);
        };
      },
      onSessionLifecycle: (listener) => {
        lifecycleListeners.add(listener);
        if (lastLifecycle)
          listener(lastLifecycle);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
      onConnection: (listener) => {
        connectionListeners.add(listener);
        if (lastReady)
          listener(lastReady.connection);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      onSettings: (listener) => {
        settingsListeners.add(listener);
        if (lastReady)
          listener(lastReady.settings);
        return () => {
          settingsListeners.delete(listener);
        };
      },
      onItem: (listener) => {
        itemListeners.add(listener);
        if (lastReady)
          listener(lastReady.item);
        return () => {
          itemListeners.delete(listener);
        };
      },
      onStatusControl: (listener) => {
        statusControlListeners.add(listener);
        return () => {
          statusControlListeners.delete(listener);
        };
      },
      onPopoverClosed: (listener) => {
        popoverClosedListeners.add(listener);
        return () => {
          popoverClosedListeners.delete(listener);
        };
      },
      setStatusControls: (controls) => {
        if (lastReady?.features?.statusControls !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support status controls."));
        }
        if (!isGuestStatusControls(controls)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Status controls must have unique bounded ids and valid selected options."));
        }
        return request({ ...envelope, type: "status-controls", id: nextId(ids), payload: { controls } });
      },
      openPopover: (payload) => {
        if (lastReady?.features?.popovers !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers."));
        }
        if (!isGuestPopoverRequest(payload)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Popover requests need bounded geometry and JSON data."));
        }
        return request({ ...envelope, type: "popover-open", id: nextId(ids), payload });
      },
      closePopover,
      setPopoverAnchorActive,
      onResolve: (handler) => {
        resolveHandler = handler;
        return () => {
          if (resolveHandler === handler)
            resolveHandler = null;
        };
      },
      toast: (payload) => {
        const message = payload.message.trim();
        if (!message || message.length > GUEST_TOAST_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast message must contain 1 to ${GUEST_TOAST_MAX} characters.`));
        }
        if (payload.copy && payload.copy !== true && (!payload.copy.text.length || payload.copy.text.length > GUEST_CLIPBOARD_TEXT_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast copy text must contain 1 to ${GUEST_CLIPBOARD_TEXT_MAX} characters.`));
        }
        return request({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "toast",
          id: nextId(ids),
          payload: { ...payload, message }
        });
      },
      openUrl: (url) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-url",
        id: nextId(ids),
        payload: { url }
      }),
      openCommit: (sha) => isGuestCommitSha(sha) ? request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-commit",
        id: nextId(ids),
        payload: { sha }
      }) : Promise.reject(new HostRequestError("HOST_REJECTED", "Commit id must be 7 to 64 hex characters.")),
      openSurface: (surfaceId) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-surface",
        id: nextId(ids),
        payload: { surfaceId }
      }),
      writeClipboard: (text) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "clipboard-write",
        id: nextId(ids),
        payload: { text }
      }),
      compose: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "compose",
        id: nextId(ids),
        payload
      }),
      attach: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "attach",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      startSession: async (payload) => {
        if (payload.projectId !== void 0)
          requireIdentity(payload.projectId);
        const worktree = payload.worktree;
        if (worktree && worktree !== true) {
          if (worktree.kind === "existing")
            requireIdentity(worktree.directory);
          else {
            if (worktree.name !== void 0)
              requireIdentity(worktree.name, 200);
            if (worktree.baseBranch !== void 0)
              requireIdentity(worktree.baseBranch, 200);
          }
        }
        const result = await send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "start-session",
          id: nextId(ids),
          payload: clampStartSessionRequest(payload)
        }, options.requestTimeoutMs ?? 18e4);
        if (!isStartSessionResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a session.");
        }
        return result;
      },
      prompt: (payload) => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "prompt",
        id: nextId(ids),
        payload: clampPromptRequest(payload)
      }).then((result) => {
        if (!isPromptResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a prompt result.");
        }
        return result;
      }),
      sessionLink: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "session-link",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      close: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "close",
        id: nextId(ids)
      }),
      oauthStart: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-start",
        id: nextId(ids)
      }),
      oauthDisconnect: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-disconnect",
        id: nextId(ids)
      }),
      request: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host request result was empty.");
        }
        return result;
      }),
      serviceRequest: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host service request result was empty.");
        }
        return result;
      }),
      serviceStatus: () => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-status",
        id: nextId(ids)
      }).then((result) => {
        if (!isServiceStatusResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return service status.");
        }
        return result;
      }),
      readFile: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-read",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileReadResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file content.");
        }
        return result;
      }),
      writeFile: (path, content) => {
        if (!isGuestFilePath(path)) {
          return rejectBadFilePath();
        }
        if (content.length > GUEST_FILE_CONTENT_MAX) {
          return Promise.reject(new HostRequestError("FILE_TOO_LARGE", `Content is over ${GUEST_FILE_CONTENT_MAX} characters.`));
        }
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "file-write",
          id: nextId(ids),
          payload: { path, content }
        }).then((result) => {
          if (!isFileWriteResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not confirm the write.");
          }
          return result;
        });
      },
      listDir: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-list",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileListResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return directory entries.");
        }
        return result;
      }),
      stat: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-stat",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileStatResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file status.");
        }
        return result;
      }),
      generate: (input) => {
        const prompt = input.prompt.trim();
        const system = input.system?.trim();
        if (prompt.length === 0 || prompt.length > GUEST_GENERATE_PROMPT_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Prompt must be 1 to ${GUEST_GENERATE_PROMPT_MAX} characters.`));
        }
        if (system !== void 0 && (system.length === 0 || system.length > GUEST_GENERATE_SYSTEM_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `System prompt must be 1 to ${GUEST_GENERATE_SYSTEM_MAX} characters.`));
        }
        const maxOutputTokens = input.maxOutputTokens === void 0 ? void 0 : Math.min(GUEST_GENERATE_OUTPUT_TOKENS_MAX, Math.max(1, Math.floor(input.maxOutputTokens)));
        if (maxOutputTokens !== void 0 && !Number.isFinite(maxOutputTokens)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "maxOutputTokens must be a number."));
        }
        const payload = { prompt };
        if (system !== void 0)
          payload.system = system;
        if (maxOutputTokens !== void 0)
          payload.maxOutputTokens = maxOutputTokens;
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "generate",
          id: nextId(ids),
          payload
        }, options.requestTimeoutMs ?? GUEST_GENERATE_TIMEOUT_MS).then((result) => {
          if (!isGenerateResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not return generated text.");
          }
          return result;
        });
      },
      setBadge: (count) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "badge",
        id: nextId(ids),
        payload: { count: clampBadgeCount(count) }
      }),
      setHeight: (height) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "resize",
        id: nextId(ids),
        payload: { height: clampFrameHeight(height) }
      }),
      onFileOpen: (listener) => {
        fileOpenListeners.add(listener);
        if (!saveShortcutInstalled) {
          saveShortcutInstalled = true;
          target.addEventListener("keydown", onSaveShortcut, true);
        }
        if (lastFile)
          listener(lastFile);
        return () => {
          fileOpenListeners.delete(listener);
        };
      },
      onFileSnapshot: (handler) => {
        fileSnapshotHandler = handler;
        return () => {
          if (fileSnapshotHandler === handler)
            fileSnapshotHandler = null;
        };
      },
      onFileSaved: (listener) => {
        fileSavedListeners.add(listener);
        return () => {
          fileSavedListeners.delete(listener);
        };
      },
      reportFileChange: (change) => notify({ ...envelope, type: "file-change", payload: { dirty: change.dirty, edited: change.edited } }),
      requestFileSave,
      reportFileUnsupported: () => notify({ ...envelope, type: "file-unsupported" }),
      dispose: () => {
        for (const subscriptionId of workspaceListeners.keys()) {
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        workspaceListeners.clear();
        for (const subscriptionId of shellsListeners.keys()) {
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        shellsListeners.clear();
        disposed = true;
        resolveHandler = null;
        actionHandler = null;
        fileSnapshotHandler = null;
        fileOpenListeners.clear();
        fileSavedListeners.clear();
        if (saveShortcutInstalled)
          target.removeEventListener("keydown", onSaveShortcut, true);
        target.removeEventListener("message", onMessage);
        target.removeEventListener("keydown", onPopoverEscape, true);
        target.removeEventListener("pointerover", onPopoverPointerOver);
        target.removeEventListener("pointermove", onPopoverPointerOver);
        target.removeEventListener("pointerout", onPopoverPointerOut);
        target.removeEventListener("focus", onPopoverFocus);
        target.removeEventListener("blur", onPopoverBlur);
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new HostRequestError("HOST_UNAVAILABLE", "Host client was disposed."));
        }
        pending.clear();
        readyListeners.clear();
        directoryListeners.clear();
        sessionListeners.clear();
        lifecycleListeners.clear();
        connectionListeners.clear();
        settingsListeners.clear();
        itemListeners.clear();
        statusControlListeners.clear();
        popoverClosedListeners.clear();
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/service-providers.js
  var BROWSER_CONTROL_ACTIONS = [
    "browser.open",
    "browser.snapshot",
    "browser.click",
    "browser.type",
    "browser.scroll",
    "browser.back",
    "browser.forward",
    "browser.inspect",
    "browser.capture",
    "browser.resize"
  ];
  var BROWSER_PROVIDER_IDLE_MS = 10 * 6e4;
  var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);

  // node_modules/@openchamber/sdk/dist/service-surface.js
  var SURFACE_CONTROLLERS = ["none", "agent", "user"];
  var CONTROLLERS = new Set(SURFACE_CONTROLLERS);

  // shared/window.ts
  var DAY_MS = 864e5;
  var CN_OFFSET = 8 * 60 * 60 * 1e3;
  function beijingParts(ts) {
    const d = new Date(ts + CN_OFFSET);
    return {
      date: d.toISOString().slice(0, 10),
      weekday: d.getUTCDay(),
      msOfDay: d.getUTCHours() * 36e5 + d.getUTCMinutes() * 6e4 + d.getUTCSeconds() * 1e3
    };
  }
  var inPeak = (msOfDay, windows) => windows.some(([from, to]) => msOfDay >= from * 6e4 && msOfDay < to * 6e4);
  function phaseAt(ts, data, holidaySet) {
    const { date, weekday, msOfDay } = beijingParts(ts);
    const holidays = holidaySet ?? new Set(data.holidays);
    if (holidays.has(date)) return "holiday";
    if (weekday === 0 || weekday === 6) return "weekend";
    return inPeak(msOfDay, data.peakWindows) ? "peak" : "offpeak";
  }
  function nextSwitch(ts, data, holidaySet) {
    const holidays = holidaySet ?? new Set(data.holidays);
    const now = phaseAt(ts, data, holidays);
    const peakNow = now === "peak";
    const dayStart = Math.floor((ts + CN_OFFSET) / DAY_MS) * DAY_MS - CN_OFFSET;
    const offsets = /* @__PURE__ */ new Set([0]);
    for (const [from, to] of data.peakWindows) {
      offsets.add(from * 6e4);
      offsets.add(to * 6e4);
    }
    const candidates = [];
    for (let d = 0; d < 15; d++) for (const off of offsets) candidates.push(dayStart + d * DAY_MS + off);
    candidates.sort((a, b) => a - b);
    for (const at of candidates) {
      if (at <= ts) continue;
      const phase = phaseAt(at, data, holidays);
      if (phase === "peak" !== peakNow) return { phase, until: at };
    }
    return { phase: peakNow ? "offpeak" : "peak", until: ts + 60 * 6e4 };
  }
  function countdownText(until, now, lang2) {
    const minutes = Math.max(1, Math.ceil((until - now) / 6e4));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (lang2 === "zh") {
      if (h > 0) return m > 0 ? `${h} \u5C0F\u65F6 ${m} \u5206` : `${h} \u5C0F\u65F6`;
      return `${m} \u5206\u949F`;
    }
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
  }
  function phaseLabel(phase, lang2) {
    const zh = {
      holiday: "\u6CD5\u5B9A\u5047\u65E5\u2014\u2014\u5168\u8C37\u4EF7",
      weekend: "\u5468\u672B\u65F6\u6BB5\u2014\u2014\u5168\u8C37\u4EF7",
      peak: "\u5CF0\u65F6",
      offpeak: "\u5E73\u4EF7"
    };
    const en = {
      holiday: "Public holiday \u2014 all off-peak",
      weekend: "Weekend \u2014 all off-peak",
      peak: "Peak",
      offpeak: "Off-peak"
    };
    return (lang2 === "zh" ? zh : en)[phase];
  }
  function phaseShort(phase, lang2) {
    const zh = { holiday: "\u5047\u65E5\u5168\u8C37", weekend: "\u5468\u672B\u5168\u8C37", peak: "\u5CF0\u65F6", offpeak: "\u5E73\u4EF7" };
    const en = { holiday: "Holiday", weekend: "Weekend", peak: "Peak", offpeak: "Off-peak" };
    return (lang2 === "zh" ? zh : en)[phase];
  }
  function nextLabel(phase, lang2) {
    if (lang2 === "zh") return phase === "peak" ? "\u540E\u8FDB\u5165\u9AD8\u5CF0" : "\u540E\u8FDB\u5165\u5E73\u4EF7";
    return phase === "peak" ? " to peak" : " to off-peak";
  }
  function dayProgress(ts) {
    return beijingParts(ts).msOfDay / DAY_MS * 100;
  }
  function blockProgress(ts, data) {
    const { start, end } = offBlock(ts, data);
    const span = end - start;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, (ts - start) / span * 100));
  }
  function offBlock(ts, data) {
    const holidays = new Set(data.holidays);
    const dayIndex = Math.floor((ts + CN_OFFSET) / DAY_MS);
    const isOff = (idx) => {
      const d = new Date(idx * DAY_MS);
      const wd = d.getUTCDay();
      return wd === 0 || wd === 6 || holidays.has(d.toISOString().slice(0, 10));
    };
    let s = dayIndex;
    let e = dayIndex;
    while (isOff(s - 1)) s -= 1;
    while (isOff(e + 1)) e += 1;
    return { start: s * DAY_MS - CN_OFFSET, end: (e + 1) * DAY_MS - CN_OFFSET };
  }
  function blockHours(ts, data) {
    const { start, end } = offBlock(ts, data);
    return Math.round((end - start) / 36e5);
  }
  function daySegments(phase, windows) {
    if (phase === "weekend" || phase === "holiday") return [{ from: 0, to: 1440, peak: false }];
    const out = [];
    let cursor = 0;
    for (const [from, to] of [...windows].sort((a, b) => a[0] - b[0])) {
      if (from > cursor) out.push({ from: cursor, to: from, peak: false });
      out.push({ from, to, peak: true });
      cursor = to;
    }
    if (cursor < 1440) out.push({ from: cursor, to: 1440, peak: false });
    return out;
  }
  function stripText(now, data, lang2, short = false) {
    const phase = phaseAt(now, data);
    const next = nextSwitch(now, data);
    const chip = short ? phaseShort(phase, lang2) : phaseLabel(phase, lang2);
    return `${chip} \xB7 ${countdownText(next.until, now, lang2)}${nextLabel(next.phase, lang2)}`;
  }

  // node_modules/@openchamber/sdk/dist/ui/theme.js
  var TOKEN_VARS = [
    ["--oc-bg", "background"],
    ["--oc-elevated", "elevated"],
    ["--oc-fg", "foreground"],
    ["--oc-muted", "muted"],
    ["--oc-subtle", "subtle"],
    ["--oc-border", "border"],
    ["--oc-hover", "hover"],
    ["--oc-selection", "selection"],
    ["--oc-focus", "focus"],
    ["--oc-primary", "primary"],
    ["--oc-muted-surface", "mutedSurface"],
    ["--oc-elevated-fg", "elevatedForeground"],
    ["--oc-active", "active"],
    ["--oc-selection-fg", "selectionForeground"],
    ["--oc-primary-fg", "primaryForeground"],
    ["--oc-primary-text", "primaryText"],
    ["--oc-success-text", "successText"],
    ["--oc-warning-text", "warningText"],
    ["--oc-error-text", "errorText"],
    ["--oc-info-text", "infoText"],
    ["--oc-success", "success"],
    ["--oc-warning", "warning"],
    ["--oc-error", "error"],
    ["--oc-info", "info"],
    ["--oc-font", "font"],
    ["--oc-mono", "mono"],
    ["--oc-radius", "radius"],
    ["--surface-background", "background"],
    ["--surface-elevated", "elevated"],
    ["--surface-foreground", "foreground"],
    ["--surface-muted-foreground", "muted"],
    ["--surface-subtle", "subtle"],
    ["--interactive-border", "border"],
    ["--interactive-hover", "hover"],
    ["--interactive-selection", "selection"],
    ["--interactive-focus-ring", "focus"],
    ["--primary", "primary"],
    ["--surface-muted", "mutedSurface"],
    ["--surface-elevated-foreground", "elevatedForeground"],
    ["--interactive-active", "active"],
    ["--interactive-selection-foreground", "selectionForeground"],
    ["--primary-foreground", "primaryForeground"],
    ["--primary-text", "primaryText"],
    ["--success-text", "successText"],
    ["--warning-text", "warningText"],
    ["--error-text", "errorText"],
    ["--info-text", "infoText"],
    ["--status-success", "success"],
    ["--status-warning", "warning"],
    ["--status-error", "error"],
    ["--status-info", "info"],
    ["--font-sans", "font"],
    ["--font-mono", "mono"],
    ["--radius", "radius"]
  ];
  var SYNTAX_TOKEN_VARS = [
    ["--oc-syntax-keyword", "--syntax-keyword", "syntaxKeyword"],
    ["--oc-syntax-string", "--syntax-string", "syntaxString"],
    ["--oc-syntax-number", "--syntax-number", "syntaxNumber"],
    ["--oc-syntax-function", "--syntax-function", "syntaxFunction"],
    ["--oc-syntax-type", "--syntax-type", "syntaxType"],
    ["--oc-syntax-comment", "--syntax-comment", "syntaxComment"],
    ["--oc-syntax-variable", "--syntax-variable", "syntaxVariable"],
    ["--oc-syntax-operator", "--syntax-operator", "syntaxOperator"]
  ];
  var applyHostTheme = (theme, root2) => {
    root2.style.colorScheme = theme.mode;
    for (const [name, key] of TOKEN_VARS) {
      root2.style.setProperty(name, theme.tokens[key]);
    }
    for (const [alias, hostName, key] of SYNTAX_TOKEN_VARS) {
      const value = theme.tokens[key] ?? "";
      root2.style.setProperty(alias, value);
      root2.style.setProperty(hostName, value);
    }
    root2.style.setProperty("font-family", theme.tokens.font);
    root2.style.setProperty("font-size", "0.875rem");
    root2.style.setProperty("line-height", "1.45");
    root2.style.setProperty("color", theme.tokens.foreground);
  };
  var applyHostReady = (ctx, root2) => {
    applyHostTheme(ctx.theme, root2);
    if (root2.dataset) {
      root2.dataset.ocSurface = ctx.surface;
      root2.dataset.ocTheme = ctx.theme.mode;
    }
  };

  // node_modules/@openchamber/sdk/dist/ui/style.js
  var OC_ALIAS = {
    "surface-background": "bg",
    "surface-elevated": "elevated",
    "surface-elevated-foreground": "elevated-fg",
    "surface-foreground": "fg",
    "surface-muted-foreground": "muted",
    "surface-muted": "muted-surface",
    "surface-subtle": "subtle",
    "interactive-border": "border",
    "interactive-hover": "hover",
    "interactive-active": "active",
    "interactive-selection": "selection",
    "interactive-selection-foreground": "selection-fg",
    "interactive-focus-ring": "focus",
    "primary": "primary",
    "primary-foreground": "primary-fg",
    "primary-text": "primary-text",
    "success-text": "success-text",
    "warning-text": "warning-text",
    "error-text": "error-text",
    "info-text": "info-text",
    "status-success": "success",
    "status-warning": "warning",
    "status-error": "error",
    "status-info": "info",
    "font-sans": "font",
    "font-mono": "mono",
    "radius": "radius"
  };
  var v = (name, fallback) => `var(--${name}, var(--oc-${OC_ALIAS[name]}, ${fallback}))`;
  var bg = v("surface-background", "transparent");
  var elevated = v("surface-elevated", "transparent");
  var elevatedFg = v("surface-elevated-foreground", "inherit");
  var fg = v("surface-foreground", "inherit");
  var muted = v("surface-muted-foreground", "gray");
  var secondary = v("surface-muted", "transparent");
  var border = v("interactive-border", "currentColor");
  var hover = v("interactive-hover", "transparent");
  var active = v("interactive-active", "transparent");
  var selection = v("interactive-selection", "transparent");
  var selectionFg = v("interactive-selection-foreground", "inherit");
  var focus = v("interactive-focus-ring", "currentColor");
  var primary = v("primary", "currentColor");
  var primaryText = v("primary-text", "inherit");
  var errorText = v("error-text", "inherit");
  var font = v("font-sans", "inherit");
  var mono = v("font-mono", "monospace");
  var radius = v("radius", "9px");
  var controlRadius = `calc(${radius} - 2px)`;
  var smallRadius = `calc(${radius} - 4px)`;
  var mix = (color, pct, base = "transparent") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  var focusRing = `box-shadow: 0 0 0 2px ${focus};`;
  var tone = (name) => {
    const color = v(`status-${name}`, "currentColor");
    return `
.oc-sdk[data-tone="${name}"], .oc-sdk [data-tone="${name}"] { --oc-sdk-tone: ${color}; --oc-sdk-tone-text: ${v(`${name}-text`, "inherit")}; }`;
  };
  var UI_SIZE_CSS = `
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`;
  var GUEST_UI_LOOK_CSS = `
.oc-sdk { color: ${fg}; font-family: ${font}; }
.oc-sdk :focus-visible { outline: none; ${focusRing} }
.oc-sdk-mono { font-family: ${mono}; }
.oc-sdk-muted { color: ${muted}; }
${tone("success")}${tone("warning")}${tone("error")}${tone("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${primary}; --oc-sdk-tone-text: ${primaryText}; }

.oc-sdk-btn { border-radius: ${controlRadius}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${smallRadius}; }
.oc-sdk-btn[data-variant="default"] { color: ${primaryText}; background: ${mix(primary, 10, bg)}; border-color: ${mix(primary, 12)}; }
.oc-sdk-btn[data-variant="default"]:hover { background: ${mix(primary, 16, bg)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${mix(primary, 22, bg)}; }
.oc-sdk-btn[data-variant="secondary"] { background: ${secondary}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="outline"] { background: ${elevated}; color: ${elevatedFg}; border-color: ${border}; }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${hover}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${active}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${v("status-error", "red")}; color: ${errorText}; background: ${mix("var(--oc-sdk-tone)", 7, bg)}; border-color: ${mix("var(--oc-sdk-tone)", 12)}; }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${mix("var(--oc-sdk-tone)", 9, bg)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${mix("var(--oc-sdk-tone)", 11, bg)}; }

.oc-sdk-field-note { color: ${muted}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${errorText}; }
.oc-sdk-input { border-radius: ${controlRadius}; background: ${elevated}; color: ${elevatedFg}; box-shadow: inset 0 0 0 1px ${mix(border, 60)}; transition: background 150ms ease-out, box-shadow 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${muted}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { box-shadow: inset 0 0 0 2px ${focus}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input { box-shadow: inset 0 0 0 1px ${v("status-error", "red")}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { box-shadow: inset 0 0 0 2px ${v("status-error", "red")}; }
.oc-sdk-input[data-mono="true"] { font-family: ${mono}; }

.oc-sdk-search-icon { color: ${muted}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${primary}; }
.oc-sdk-search-clear { border-radius: ${smallRadius}; color: ${muted}; }
.oc-sdk-search-clear:hover { background: ${hover}; color: ${fg}; }

.oc-sdk-trigger { border-color: ${border}; border-radius: ${controlRadius}; background: ${elevated}; color: ${elevatedFg}; transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${muted}; }
.oc-sdk-trigger-chevron { color: ${muted}; }
.oc-sdk-popup { --surface-foreground: ${elevatedFg}; border-color: ${mix(border, 60)}; border-radius: 12px; background: ${elevated}; color: ${elevatedFg}; box-shadow: 0 8px 24px ${mix(fg, 12)}; }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${hover}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-option-check { color: ${fg}; }
.oc-sdk-option[data-destructive="true"] { color: ${errorText}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${mix(v("status-error", "red"), 10)}; }
.oc-sdk-option-hint { color: ${muted}; }
.oc-sdk-popup-empty { color: ${muted}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${border}; border-radius: 4px; color: ${fg}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${mix(fg, 60, border)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${border}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${bg}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${primary}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${focusRing} }
.oc-sdk-check-desc { color: ${muted}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${mix(fg, 4)}; }
.oc-sdk-tab { border-radius: 8px; color: ${muted}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${fg}; }
.oc-sdk-tab[aria-selected="true"] { color: ${selectionFg}; background: ${selection}; border-color: ${border}; }
.oc-sdk-tab-count { color: ${muted}; }

.oc-sdk-badge { border-radius: 9999px; background: ${hover}; color: ${muted}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${mix("var(--oc-sdk-tone)", 15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${hover}; }
.oc-sdk-row[aria-selected="true"] { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-row-lead { font-family: ${mono}; color: ${muted}; }
.oc-sdk-row-sub { color: ${muted}; }
.oc-sdk-row-meta { color: ${muted}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${muted}; }

.oc-sdk-empty-body { color: ${muted}; }

.oc-sdk-spinner { color: ${muted}; }
.oc-sdk-spinner-ring { border-color: ${border}; border-top-color: ${primary}; border-radius: 9999px; }

.oc-sdk-banner { border-color: ${mix("var(--oc-sdk-tone)", 40)}; border-radius: 8px; background: ${mix("var(--oc-sdk-tone)", 10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${muted}; }

.oc-sdk-separator { color: ${muted}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${mix(border, 40)}; }

.oc-sdk-progress-label { color: ${muted}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${border}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${primary}); }

.oc-sdk-text a { color: ${primaryText}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${mix(border, 60)}; }
`;
  var UI_CSS = `
${GUEST_SCROLLBAR_CSS}
${UI_SIZE_CSS}
${GUEST_UI_LOOK_CSS}`;

  // node_modules/@openchamber/sdk/dist/ui/dom.js
  var STYLE_ID = "oc-sdk-ui-style";
  var clearNode = (node) => {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  };
  var ensureStyle = (css) => {
    const existing = document.getElementById(STYLE_ID);
    if (existing instanceof HTMLStyleElement) {
      if (existing.textContent !== css) {
        existing.textContent = css;
      }
      return;
    }
    installGuestScrollbarActivity(document);
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  };
  var el = (tag, className) => {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  };
  var button = (className) => {
    const node = el("button", className);
    node.type = "button";
    return node;
  };
  var setText = (node, text) => {
    const next = text ?? "";
    if (node.textContent !== next) {
      node.textContent = next;
    }
  };
  var setAttr = (node, name, value) => {
    if (value === void 0 || value === null || value === "") {
      node.removeAttribute(name);
    } else if (node.getAttribute(name) !== value) {
      node.setAttribute(name, value);
    }
  };
  var onOutsideClick = (node, handler) => {
    const listener = (event) => {
      if (event.target instanceof Node && node.contains(event.target)) {
        return;
      }
      handler();
    };
    document.addEventListener("pointerdown", listener, true);
    return () => {
      document.removeEventListener("pointerdown", listener, true);
    };
  };

  // node_modules/@openchamber/sdk/dist/ui/button.js
  var ring = () => {
    const spinner = document.createElement("span");
    spinner.className = "oc-sdk-spinner-ring";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
  };
  var mountButton = (root2, initial) => {
    ensureStyle(UI_CSS);
    let props = initial;
    const node = button("oc-sdk oc-sdk-btn");
    const spinner = ring();
    const label = document.createElement("span");
    node.append(label);
    root2.append(node);
    const paint = () => {
      node.dataset.variant = props.variant ?? "default";
      node.dataset.size = props.size ?? "default";
      node.disabled = Boolean(props.disabled) || Boolean(props.loading);
      node.dataset.loading = props.loading ? "true" : "false";
      node.setAttribute("aria-busy", props.loading ? "true" : "false");
      if (props.loading && spinner.parentNode !== node) {
        node.prepend(spinner);
      } else if (!props.loading && spinner.parentNode === node) {
        spinner.remove();
      }
      setText(label, props.label);
    };
    const onClick = () => {
      if (props.disabled || props.loading) {
        return;
      }
      props.onClick();
    };
    node.addEventListener("click", onClick);
    paint();
    return {
      update: (next) => {
        props = { ...props, ...next };
        paint();
      },
      dispose: () => {
        node.removeEventListener("click", onClick);
        node.remove();
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/ui/icons.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICON_PATH = {
    search: "M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z",
    chevron: "M12 13.172l4.95-4.95 1.414 1.414L12 16 5.636 9.636 7.05 8.222z",
    check: "M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z",
    close: "M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z"
  };
  var icon = (name, size, className) => {
    const node = document.createElementNS(SVG_NS, "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("width", String(size));
    node.setAttribute("height", String(size));
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("fill", "currentColor");
    if (className) {
      node.setAttribute("class", className);
    }
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", ICON_PATH[name]);
    node.append(path);
    return node;
  };

  // node_modules/@openchamber/sdk/dist/ui/navigation.js
  var navigationKey = (event, axis = "vertical") => {
    const [next, previous] = axis === "vertical" ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
    if (event.key === next || event.ctrlKey && event.key.toLowerCase() === "n")
      return "next";
    if (event.key === previous || event.ctrlKey && event.key.toLowerCase() === "p")
      return "previous";
    if (event.key === "Home")
      return "first";
    if (event.key === "End")
      return "last";
    return null;
  };
  var moveListSelection = (items, currentId, key) => {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) {
      return null;
    }
    const first = enabled[0];
    const last = enabled[enabled.length - 1];
    if (key === "first" || !first || !last) {
      return first?.id ?? null;
    }
    if (key === "last") {
      return last.id;
    }
    const index = enabled.findIndex((item) => item.id === currentId);
    if (index === -1) {
      return key === "next" ? first.id : last.id;
    }
    const target = enabled[Math.min(enabled.length - 1, Math.max(0, index + (key === "next" ? 1 : -1)))];
    return target?.id ?? null;
  };

  // node_modules/@openchamber/sdk/dist/ui/option.js
  var optionId = (uid, id) => `${uid}-${id ?? ""}`;
  var createOption = (uid, role, spec, on) => {
    const node = button("oc-sdk-option");
    node.id = optionId(uid, spec.id);
    node.setAttribute("role", role);
    node.tabIndex = -1;
    node.disabled = Boolean(spec.disabled);
    if (role === "option") {
      node.setAttribute("aria-selected", spec.selected ? "true" : "false");
    }
    node.dataset.destructive = spec.destructive ? "true" : "false";
    const label = el("span", "oc-sdk-option-label");
    label.textContent = spec.label;
    node.append(label);
    if (spec.hint) {
      const hint = el("span", "oc-sdk-option-hint");
      hint.textContent = spec.hint;
      node.append(hint);
    }
    if (role === "option") {
      node.dataset.mark = "check";
      const check = el("span", "oc-sdk-option-check");
      check.append(icon("check", 14));
      node.append(check);
    }
    node.addEventListener("pointerenter", on.hover);
    node.addEventListener("click", on.pick);
    return node;
  };
  var highlightOption = (container, focusOwner, uid, id) => {
    const target = optionId(uid, id);
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLElement && child.classList.contains("oc-sdk-option")) {
        child.dataset.active = child.id === target ? "true" : "false";
      }
    }
    setAttr(focusOwner, "aria-activedescendant", id ? target : null);
    container.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  };

  // node_modules/@openchamber/sdk/dist/ui/popup.js
  var placePopup = (popup, trigger) => {
    const rect = trigger.getBoundingClientRect();
    popup.style.minWidth = `${Math.round(rect.width)}px`;
    popup.style.left = `${Math.round(rect.left)}px`;
    popup.style.top = `${Math.round(rect.bottom + 4)}px`;
    const height = popup.offsetHeight;
    const roomBelow = window.innerHeight - rect.bottom - 8;
    if (height > roomBelow && rect.top - 8 > roomBelow) {
      popup.style.top = `${Math.max(8, Math.round(rect.top - 4 - height))}px`;
    }
    const overflow = rect.left + popup.offsetWidth - window.innerWidth + 8;
    if (overflow > 0) {
      popup.style.left = `${Math.max(8, Math.round(rect.left - overflow))}px`;
    }
  };
  var openPopup = (host2, trigger, popup, close) => {
    host2.append(popup);
    placePopup(popup, trigger);
    const stopOutside = onOutsideClick(host2, close);
    const onResize = () => {
      close();
    };
    const onScroll = (event) => {
      if (event.target instanceof Node && popup.contains(event.target)) {
        return;
      }
      close();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      stopOutside();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      popup.remove();
    };
  };

  // node_modules/@openchamber/sdk/dist/ui/select.js
  var filterSelectOptions = (options, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [...options];
    }
    return options.filter((option) => option.label.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle));
  };
  var selectCount = 0;
  var mountSelect = (root2, initial) => {
    ensureStyle(UI_CSS);
    let props = initial;
    const uid = `oc-sdk-select-${selectCount += 1}`;
    const wrap = el("div", "oc-sdk oc-sdk-select");
    const caption = el("span", "oc-sdk-field-label");
    caption.id = `${uid}-label`;
    const trigger = button("oc-sdk-trigger");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-labelledby", caption.id);
    const value = el("span", "oc-sdk-trigger-value");
    trigger.append(value, icon("chevron", 14, "oc-sdk-trigger-chevron"));
    wrap.append(caption, trigger);
    root2.append(wrap);
    let query = "";
    let activeId = null;
    let closePopup = null;
    const popup = el("div", "oc-sdk oc-sdk-popup");
    const searchSlot = el("div", "oc-sdk-popup-search");
    const search = el("input", "oc-sdk-input");
    search.type = "text";
    search.autocomplete = "off";
    searchSlot.append(search);
    const listbox = el("div");
    listbox.setAttribute("role", "listbox");
    listbox.tabIndex = -1;
    popup.append(listbox);
    const visible = () => filterSelectOptions(props.options, props.searchable ? query : "");
    const focusOwner = () => props.searchable ? search : listbox;
    const setActive = (id) => {
      activeId = id;
      highlightOption(listbox, focusOwner(), uid, id);
    };
    const paintOptions = () => {
      clearNode(listbox);
      const options = visible();
      if (options.length === 0) {
        const empty = el("div", "oc-sdk-popup-empty");
        empty.textContent = "No matches";
        listbox.append(empty);
      }
      for (const option of options) {
        listbox.append(createOption(uid, "option", { ...option, selected: option.id === props.value }, {
          hover: () => setActive(option.id),
          pick: () => pick(option.id)
        }));
      }
      setActive(options.some((option) => option.id === activeId) ? activeId : options[0]?.id ?? null);
    };
    const close = () => {
      const dispose = closePopup;
      closePopup = null;
      dispose?.();
      query = "";
      search.value = "";
      trigger.setAttribute("aria-expanded", "false");
    };
    const open = () => {
      if (closePopup || props.disabled) {
        return;
      }
      activeId = props.value;
      search.placeholder = props.searchPlaceholder ?? "Search";
      if (props.searchable)
        popup.prepend(searchSlot);
      else
        searchSlot.remove();
      paintOptions();
      closePopup = openPopup(wrap, trigger, popup, close);
      trigger.setAttribute("aria-expanded", "true");
      focusOwner().focus();
    };
    const pick = (id) => {
      close();
      trigger.focus();
      if (id !== props.value)
        props.onChange(id);
    };
    const onTriggerClick = () => {
      if (closePopup)
        close();
      else
        open();
    };
    const onTriggerKey = (event) => {
      if (!closePopup && navigationKey(event)) {
        event.preventDefault();
        open();
      }
    };
    const onPopupKey = (event) => {
      const step = navigationKey(event);
      if (step) {
        event.preventDefault();
        setActive(moveListSelection(visible(), activeId, step));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (activeId)
          pick(activeId);
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
        trigger.focus();
      } else if (props.searchable && event.target !== search && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        search.focus();
      }
    };
    const onSearchInput = () => {
      query = search.value;
      paintOptions();
    };
    const onFocusOut = (event) => {
      if (closePopup && !(event.relatedTarget instanceof Node && wrap.contains(event.relatedTarget)))
        close();
    };
    const paint = () => {
      setText(caption, props.label);
      caption.hidden = !props.label;
      const current = props.options.find((option) => option.id === props.value);
      setText(value, current?.label ?? props.placeholder ?? "Select");
      value.dataset.empty = current ? "false" : "true";
      trigger.disabled = Boolean(props.disabled);
      if (closePopup)
        paintOptions();
    };
    trigger.addEventListener("click", onTriggerClick);
    trigger.addEventListener("keydown", onTriggerKey);
    popup.addEventListener("keydown", onPopupKey);
    search.addEventListener("input", onSearchInput);
    wrap.addEventListener("focusout", onFocusOut);
    paint();
    return {
      update: (next) => {
        props = { ...props, ...next };
        paint();
      },
      dispose: () => {
        close();
        trigger.removeEventListener("click", onTriggerClick);
        trigger.removeEventListener("keydown", onTriggerKey);
        popup.removeEventListener("keydown", onPopupKey);
        search.removeEventListener("input", onSearchInput);
        wrap.removeEventListener("focusout", onFocusOut);
        wrap.remove();
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/ui/tabs.js
  var mountTabs = (root2, initial) => {
    ensureStyle(UI_CSS);
    let props = initial;
    const track = el("div", "oc-sdk oc-sdk-tabs");
    track.setAttribute("role", "tablist");
    root2.append(track);
    const paint = () => {
      clearNode(track);
      track.dataset.track = props.trackBackground ? "true" : "false";
      for (const item of props.items) {
        const tab = button("oc-sdk-tab");
        tab.setAttribute("role", "tab");
        const active2 = item.id === props.activeId;
        tab.setAttribute("aria-selected", active2 ? "true" : "false");
        tab.tabIndex = active2 ? 0 : -1;
        tab.dataset.id = item.id;
        const label = el("span");
        label.textContent = item.label;
        tab.append(label);
        if (item.count !== void 0) {
          const count = el("span", "oc-sdk-tab-count");
          count.textContent = String(item.count);
          tab.append(count);
        }
        tab.addEventListener("click", () => {
          if (item.id !== props.activeId)
            props.onChange(item.id);
        });
        track.append(tab);
      }
    };
    const onKeyDown = (event) => {
      const step = navigationKey(event, "horizontal");
      if (!step) {
        return;
      }
      const next = moveListSelection(props.items, props.activeId, step);
      if (next && next !== props.activeId) {
        event.preventDefault();
        props.onChange(next);
        const tab = track.querySelector(`[data-id="${CSS.escape(next)}"]`);
        if (tab instanceof HTMLElement)
          tab.focus();
      }
    };
    track.addEventListener("keydown", onKeyDown);
    paint();
    return {
      update: (next) => {
        props = { ...props, ...next };
        paint();
      },
      dispose: () => {
        track.removeEventListener("keydown", onKeyDown);
        track.remove();
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/ui/empty.js
  var mountEmpty = (root2, initial) => {
    ensureStyle(UI_CSS);
    let props = initial;
    const shell = el("div", "oc-sdk oc-sdk-empty");
    const title = el("h2", "oc-sdk-empty-title");
    const body = el("p", "oc-sdk-empty-body");
    const slot = el("div", "oc-sdk-empty-action");
    shell.append(title, body, slot);
    root2.append(shell);
    let action = null;
    const paint = () => {
      setText(title, props.title);
      setText(body, props.body);
      body.hidden = !props.body;
      slot.hidden = !props.action;
      if (!props.action) {
        action?.dispose();
        action = null;
        return;
      }
      const next = { label: props.action.label, onClick: props.action.onClick };
      if (action) {
        action.update(next);
      } else {
        action = mountButton(slot, { ...next, variant: "outline", size: "sm" });
      }
    };
    paint();
    return {
      update: (next) => {
        props = { ...props, ...next };
        paint();
      },
      dispose: () => {
        action?.dispose();
        action = null;
        shell.remove();
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/ui/banner.js
  var mountBanner = (root2, initial) => {
    ensureStyle(UI_CSS);
    let props = initial;
    const node = el("div", "oc-sdk oc-sdk-banner");
    const text = el("div", "oc-sdk-banner-text");
    const title = el("div", "oc-sdk-banner-title");
    const body = el("div", "oc-sdk-banner-body");
    const slot = el("div", "oc-sdk-banner-action");
    text.append(title, body);
    node.append(text, slot);
    root2.append(node);
    let action = null;
    const paint = () => {
      node.dataset.tone = props.tone;
      node.setAttribute("role", props.tone === "error" || props.tone === "warning" ? "alert" : "status");
      setText(title, props.title);
      setText(body, props.body);
      body.hidden = !props.body;
      slot.hidden = !props.action;
      if (!props.action) {
        action?.dispose();
        action = null;
        return;
      }
      const next = { label: props.action.label, onClick: props.action.onClick };
      if (action) {
        action.update(next);
      } else {
        action = mountButton(slot, { ...next, variant: "outline", size: "xs" });
      }
    };
    paint();
    return {
      update: (next) => {
        props = { ...props, ...next };
        paint();
      },
      dispose: () => {
        action?.dispose();
        action = null;
        node.remove();
      }
    };
  };

  // panel/main.ts
  var L = {
    zh: {
      title: "\u4F1A\u8BDD\u7528\u91CF",
      refresh: "\u5237\u65B0",
      scopeAll: "\u542B\u5B50\u4EE3\u7406",
      scopeMain: "\u4EC5\u4E3B\u4F1A\u8BDD",
      kpiTotal: "\u603B token",
      kpiInput: "\u8F93\u5165\uFF08\u672A\u547D\u4E2D\uFF09",
      kpiOutput: "\u8F93\u51FA\uFF08\u542B\u63A8\u7406\uFF09",
      kpiReasoning: "\u63A8\u7406",
      kpiCacheRead: "\u7F13\u5B58\u8BFB\u53D6",
      kpiCacheWrite: "\u7F13\u5B58\u5199\u5165",
      kpiHit: "\u7F13\u5B58\u547D\u4E2D\u7387",
      kpiRequests: "\u8BF7\u6C42\u6570",
      kpiCost: "\u8D39\u7528",
      hitTip: "cacheRead \xF7 (input + cacheRead + cacheWrite)\uFF0C\u5206\u6BCD\u542B\u7F13\u5B58\u5199",
      costTip: (peak, off, hasDeepseek) => hasDeepseek ? `DeepSeek \u6309\u5B98\u65B9\u5CF0\u8C37\u4EF7\u91CD\u7B97\u4EBA\u6C11\u5E01\uFF08\u5176\u4E2D\u5CF0 ${peak} / \u8C37 ${off}\uFF1B\u7F13\u5B58\u5199\u4E0D\u8BA1\u8D39\uFF09\uFF1B\u5176\u4ED6\u6A21\u578B\u4E3A OpenCode \u8BB0\u8D26 USD` : "OpenCode \u8BB0\u5F55\u7684\u7F8E\u5143\u8D39\u7528\uFF08USD\uFF09",
      costPeakOff: (peak, off) => `\u5176\u4E2D\u5CF0 ${peak} \xB7 \u8C37 ${off}`,
      outputTip: (o, r) => `\u8F93\u51FA ${o}\uFF0C\u5176\u4E2D\u63A8\u7406 ${r}`,
      totalTip: (t) => `input + output + reasoning + cacheRead + cacheWrite = ${t}`,
      byModel: "\u6309\u6A21\u578B",
      billingTitle: "\u8BA1\u8D39\u6A21\u578B\u8BBE\u7F6E",
      billingAdd: "\u6DFB\u52A0\u8BA1\u8D39\u6A21\u578B",
      billingPickProvider: "\u4F9B\u5E94\u5546",
      billingPickModel: "\u6A21\u578B",
      billingRemove: "\u79FB\u9664",
      billingUnknownProvider: "\uFF08\u672A\u77E5\u4F9B\u5E94\u5546\uFF09",
      billingEmpty: "\u5217\u8868\u4E3A\u7A7A\uFF1A\u6240\u6709\u6A21\u578B\u90FD\u6309 OpenCode \u8BB0\u8D26\uFF08\u514D\u8D39\u6A21\u578B\u5373 $0\uFF09",
      billingUnpriceable: "\u4E0D\u9002\u7528\u5B98\u65B9\u4EF7",
      billingNote: "\u5217\u8868\u91CC\u7684\u300C\u4F9B\u5E94\u5546 / \u6A21\u578B\u300D\u6309 DeepSeek \u5B98\u65B9\u5CF0\u8C37\u4EF7\u91CD\u7B97\u4EBA\u6C11\u5E01\uFF08\u5468\u672B\u4E0E\u6CD5\u5B9A\u8282\u5047\u65E5\u6309\u8C37\u4EF7\uFF0C\u7F13\u5B58\u5199\u4E0D\u8BA1\u8D39\uFF09\uFF1B\u5176\u4F59\u6A21\u578B\u4E00\u5F8B\u7528 OpenCode \u8BB0\u5F55\u7684 USD\uFF08\u514D\u8D39\u6A21\u578B\u5373 $0\uFF09\u3002id \u542B free \u7684\u6A21\u578B\u4E0D\u4F1A\u6309\u5B98\u65B9\u4EF7\u7B97\u3002",
      billingTagOfficial: "\u5B98\u65B9",
      billingTagRecorded: "\u8BB0\u8D26",
      billingTip: "\u8BA1\u8D39\u65B9\u5F0F\uFF1A\u5B98\u65B9=\u6309 DeepSeek \u5B98\u65B9\u5CF0\u8C37\u4EF7\u91CD\u7B97\uFF08\xA5\uFF09\uFF1B\u8BB0\u8D26=OpenCode \u8BB0\u5F55\u7684 USD",
      billingLoadFailed: "\u8BFB\u53D6\u8BA1\u8D39\u8BBE\u7F6E\u5931\u8D25",
      billingSaveFailed: "\u8BA1\u8D39\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25",
      holidayTitle: "\u8282\u5047\u65E5",
      holidayNone: "\u6682\u65E0\u8282\u5047\u65E5\u6570\u636E",
      holidayExtra: (n) => `\u624B\u5DE5\u8FFD\u52A0 ${n} \u5929`,
      holidayNever: "\u672A\u540C\u6B65\u8FC7",
      holidaySynced: (t) => `\u5DF2\u540C\u6B65 ${t}`,
      holidaySync: "\u540C\u6B65\u8282\u5047\u65E5",
      holidaySyncing: "\u540C\u6B65\u4E2D\u2026",
      holidaySyncOk: (list) => `\u5DF2\u66F4\u65B0 ${list}`,
      holidaySyncFail: "\u540C\u6B65\u5931\u8D25\uFF0C\u6CBF\u7528\u5DF2\u6709\u6570\u636E",
      holidayNote: "\u5468\u672B\u4E0E\u4E2D\u56FD\u6CD5\u5B9A\u8282\u5047\u65E5\u5168\u5929\u6309\u8C37\u4EF7\uFF1B\u6570\u636E\u6765\u81EA holiday-cn\uFF08MIT\uFF09\uFF0C\u53EA\u6709\u70B9\u300C\u540C\u6B65\u8282\u5047\u65E5\u300D\u624D\u4F1A\u8054\u7F51\u3002",
      children: (n) => `\u5B50\u4F1A\u8BDD\u660E\u7EC6\uFF08${n}\uFF09`,
      childSub: (req, hit) => `${req} \u6B21\u8BF7\u6C42 \xB7 \u547D\u4E2D\u7387 ${hit}`,
      childNested: (n) => `\u542B ${n} \u5C42\u5B50\u4F1A\u8BDD`,
      trendTitle: "\u6BCF\u6B21\u8BF7\u6C42\u7684 prompt \u5927\u5C0F",
      trendTip: "input + cacheRead\uFF0C\u6309\u65F6\u95F4\u5E8F\uFF1B\u547D\u4E2D\u7F13\u5B58\u7684\u90E8\u5206\u8D8A\u591A\u66F2\u7EBF\u8D8A\u9AD8",
      trendMeta: (n, max, last, avg, sampled) => `${n} \u6B21\u8BF7\u6C42 \xB7 \u6700\u5927 ${max} \xB7 \u6700\u65B0 ${last} \xB7 \u5E73\u5747 ${avg}${sampled ? " \xB7 \u5DF2\u62BD\u6837" : ""}`,
      noTrend: "\u6682\u65E0\u8BF7\u6C42",
      updatedAt: (t) => `\u66F4\u65B0\u4E8E ${t}`,
      loading: "\u6B63\u5728\u8BFB\u53D6\u7528\u91CF\u2026",
      footer: (schema) => `\u6570\u636E\u6E90\uFF1Aopencode.db\uFF08${schema}\uFF09\xB7 \u8D39\u7528\uFF1A\u8BA1\u8D39\u5217\u8868\u5185=DeepSeek \u5B98\u65B9\u5CF0\u8C37\u4EF7\uFF08\xA5\uFF09\uFF0C\u5176\u4F59=OpenCode \u8BB0\u8D26\uFF08$\uFF09`,
      emptyTitle: "\u6682\u65E0\u7528\u91CF\u6570\u636E",
      emptyBody: "\u8BE5\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u52A9\u624B\u6D88\u606F\u3002\u53D1\u51FA\u7B2C\u4E00\u6761\u6D88\u606F\u540E\u7EDF\u8BA1\u4F1A\u81EA\u52A8\u51FA\u73B0\u3002",
      notConnected: "\u672A\u8FDE\u63A5\u4F1A\u8BDD",
      notConnectedBody: "\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u8BE5\u4F1A\u8BDD\u7684\u5B9E\u65F6\u7528\u91CF\u3002",
      serviceDown: "\u672C\u5730\u670D\u52A1\u4E0D\u53EF\u7528",
      serviceDownBody: (m) => `\u65E0\u6CD5\u8BFB\u53D6\u7528\u91CF\u6570\u636E\uFF1A${m}`,
      retry: "\u91CD\u8BD5",
      dbMissing: "\u627E\u4E0D\u5230 opencode.db",
      hintToggle: "\u53EF\u5207\u6362\u300C\u4EC5\u4E3B\u4F1A\u8BDD / \u542B\u5B50\u4EE3\u7406\u300D",
      mainOnlyNote: "\u5F53\u524D\u4EC5\u7EDF\u8BA1\u4E3B\u4F1A\u8BDD\uFF08\u4E0D\u542B\u5B50\u4EE3\u7406\uFF09"
    },
    en: {
      title: "Session Usage",
      refresh: "Refresh",
      scopeAll: "With subagents",
      scopeMain: "Main only",
      kpiTotal: "Total tokens",
      kpiInput: "Input (miss)",
      kpiOutput: "Output (incl. reasoning)",
      kpiReasoning: "Reasoning",
      kpiCacheRead: "Cache read",
      kpiCacheWrite: "Cache write",
      kpiHit: "Cache hit rate",
      kpiRequests: "Requests",
      kpiCost: "Cost",
      hitTip: "cacheRead \xF7 (input + cacheRead + cacheWrite); the denominator includes cache writes",
      costTip: (peak, off, hasDeepseek) => hasDeepseek ? `DeepSeek recomputed at official peak/off-peak prices (CNY; peak ${peak} / off-peak ${off}; cache writes not billed); other models use OpenCode-recorded USD` : "USD as recorded by OpenCode",
      costPeakOff: (peak, off) => `peak ${peak} \xB7 off-peak ${off}`,
      outputTip: (o, r) => `output ${o}, of which reasoning ${r}`,
      totalTip: (t) => `input + output + reasoning + cacheRead + cacheWrite = ${t}`,
      byModel: "By model",
      billingTitle: "Billing models",
      billingAdd: "Add billing model",
      billingPickProvider: "Provider",
      billingPickModel: "Model",
      billingRemove: "Remove",
      billingUnknownProvider: "(unknown provider)",
      billingEmpty: "Empty list: every model uses OpenCode-recorded USD (free models are $0)",
      billingUnpriceable: "no official price",
      billingNote: 'Models listed here are recomputed at DeepSeek official peak/off-peak CNY prices (weekends and Chinese public holidays are off-peak; cache writes not billed); every other model uses OpenCode-recorded USD (free models $0). Ids containing "free" are never priced officially.',
      billingTagOfficial: "official",
      billingTagRecorded: "recorded",
      billingTip: "Billing: official = recomputed at DeepSeek official peak/off-peak prices (\xA5); recorded = USD as recorded by OpenCode",
      billingLoadFailed: "Could not read billing settings",
      billingSaveFailed: "Could not save billing settings",
      holidayTitle: "Holidays",
      holidayNone: "No holiday data",
      holidayExtra: (n) => `${n} manual date(s)`,
      holidayNever: "never synced",
      holidaySynced: (t) => `synced ${t}`,
      holidaySync: "Sync holidays",
      holidaySyncing: "Syncing\u2026",
      holidaySyncOk: (list) => `updated ${list}`,
      holidaySyncFail: "Sync failed, kept existing data",
      holidayNote: 'Weekends and Chinese public holidays are off-peak all day; data from holiday-cn (MIT). Only "Sync holidays" goes online.',
      children: (n) => `Subagent sessions (${n})`,
      childSub: (req, hit) => `${req} requests \xB7 hit ${hit}`,
      childNested: (n) => `${n} nested session(s)`,
      trendTitle: "Prompt size per request",
      trendTip: "input + cacheRead, in time order; higher when more comes from cache",
      trendMeta: (n, max, last, avg, sampled) => `${n} requests \xB7 max ${max} \xB7 last ${last} \xB7 avg ${avg}${sampled ? " \xB7 sampled" : ""}`,
      noTrend: "No requests yet",
      updatedAt: (t) => `updated ${t}`,
      loading: "Loading usage\u2026",
      footer: (schema) => `Source: opencode.db (${schema}) \xB7 cost: listed models = DeepSeek official peak/off-peak CNY; others = OpenCode-recorded USD`,
      emptyTitle: "No usage yet",
      emptyBody: "This session has no assistant messages yet. Stats appear after the first reply.",
      notConnected: "No session",
      notConnectedBody: "Open a session and its live usage will show up here.",
      serviceDown: "Local service unavailable",
      serviceDownBody: (m) => `Could not read usage data: ${m}`,
      retry: "Retry",
      dbMissing: "opencode.db not found",
      hintToggle: 'Toggle "main only / with subagents"',
      mainOnlyNote: "Showing main session only (subagents excluded)"
    }
  };
  var detectLang = (locale) => (locale ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
  var host = connectHost();
  var params = new URLSearchParams(location.search);
  var MOCK = params.has("mock");
  var root = document.querySelector("#root");
  var lang = detectLang(navigator.language);
  var T = () => L[lang];
  var built = false;
  var booted = false;
  var loading = false;
  var sessionId = null;
  var scope = "total";
  var lastReport = null;
  var lastFetchAt = 0;
  var config = null;
  var rules = [];
  var ruleHandles = [];
  var savingRules = false;
  var syncingHolidays = false;
  var el2 = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  };
  var fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  var fmtTokens = (n) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
  };
  var fmtUsd = (n) => `$${n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4)}`;
  var fmtCny = (n) => `\xA5${n.toFixed(4)}`;
  var moneyText = (m) => {
    if (m.hasDeepseek) return m.hasOther ? `${fmtCny(m.costCny)} + ${fmtUsd(m.costUsdOther)}` : fmtCny(m.costCny);
    return fmtUsd(m.cost);
  };
  var modelMoneyText = (m) => m.currency === "CNY" ? fmtCny(m.amount) : fmtUsd(m.cost);
  var costTipText = (m) => T().costTip(fmtCny(m.costCnyPeak), fmtCny(m.costCnyOff), m.hasDeepseek);
  var fmtPct = (r) => r == null ? "\u2014" : `${(r * 100).toFixed(1)}%`;
  var fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "\u2014";
  var fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }) : "\u2014";
  var titleEl;
  var updatedEl;
  var refreshHandle = null;
  var subEl;
  var tabsSlot;
  var tabsHandle = null;
  var bannerSlot;
  var bannerHandle = null;
  var bodyEl;
  var emptySlot;
  var emptyHandle = null;
  var kTotal;
  var kInput;
  var kOutput;
  var kReasoning;
  var kCacheRead;
  var kCacheWrite;
  var kHit;
  var kRequests;
  var kCost;
  var modelsEl;
  var settingsEl;
  var billingListEl;
  var billingAddSlot;
  var billingNoteEl;
  var holidayLineEl;
  var holidaySyncSlot;
  var holidayNoteEl;
  var peakEl;
  var peakTrackEl;
  var peakMarkerEl;
  var peakChipEl;
  var peakSig = "";
  var windowData = null;
  var billingAddHandle = null;
  var holidaySyncHandle = null;
  var childrenDetails;
  var childrenSummary;
  var childListEl;
  var trendEl;
  var footEl;
  function makeKpi(grid, label, accent = false) {
    const card = el2("div", accent ? "card accent" : "card");
    const k = el2("div", "k", label);
    const value = el2("div", "v", "\u2014");
    const sub = el2("div", "sub", "");
    card.append(k, value, sub);
    grid.append(card);
    return { card, value, sub };
  }
  function buildDom() {
    if (built) return;
    built = true;
    const t = T();
    const wrap = el2("div", "wrap");
    const head = el2("div", "head");
    titleEl = el2("div", "title", t.title);
    updatedEl = el2("div", "updated", "");
    const refreshSlot = el2("div", "refresh-slot");
    head.append(titleEl, updatedEl, refreshSlot);
    subEl = el2("div", "session-line mono");
    tabsSlot = el2("div", "tabs-slot");
    bannerSlot = el2("div", "banner-slot");
    bodyEl = el2("div", "body");
    const cards = el2("div", "cards");
    kTotal = makeKpi(cards, t.kpiTotal);
    kHit = makeKpi(cards, t.kpiHit, true);
    kInput = makeKpi(cards, t.kpiInput);
    kOutput = makeKpi(cards, t.kpiOutput);
    kReasoning = makeKpi(cards, t.kpiReasoning);
    kCacheRead = makeKpi(cards, t.kpiCacheRead);
    kCacheWrite = makeKpi(cards, t.kpiCacheWrite);
    kRequests = makeKpi(cards, t.kpiRequests);
    kCost = makeKpi(cards, t.kpiCost);
    kTotal.card.title = t.totalTip("input + output + reasoning + cacheRead + cacheWrite");
    kHit.card.title = t.hitTip;
    const modelTitle = el2("div", "section", t.byModel);
    modelsEl = el2("div", "models");
    peakEl = el2("div", "peak-strip");
    peakTrackEl = el2("div", "peak-track");
    peakMarkerEl = el2("div", "peak-marker");
    peakChipEl = el2("span", "peak-chip", "");
    peakEl.append(peakTrackEl, peakChipEl);
    peakEl.hidden = true;
    settingsEl = el2("div", "settings");
    settingsEl.hidden = true;
    const billingTitle = el2("div", "section", t.billingTitle);
    billingTitle.title = t.billingTip;
    billingListEl = el2("div", "rules");
    billingAddSlot = el2("div", "rule-add");
    billingNoteEl = el2("div", "rule-note", t.billingNote);
    const holidayTitle = el2("div", "section", t.holidayTitle);
    holidayLineEl = el2("div", "holiday-line", "");
    holidaySyncSlot = el2("div", "holiday-sync");
    holidayNoteEl = el2("div", "rule-note", t.holidayNote);
    settingsEl.append(
      peakEl,
      billingTitle,
      billingListEl,
      billingAddSlot,
      billingNoteEl,
      holidayTitle,
      holidayLineEl,
      holidaySyncSlot,
      holidayNoteEl
    );
    childrenDetails = document.createElement("details");
    childrenDetails.className = "children";
    childrenSummary = el2("summary", "", t.children(0));
    childListEl = el2("div", "child-list");
    childrenDetails.append(childrenSummary, childListEl);
    const trendTitle = el2("div", "section", t.trendTitle);
    trendEl = el2("div", "trend");
    trendEl.title = t.trendTip;
    footEl = el2("div", "foot", "");
    bodyEl.append(cards, modelTitle, modelsEl, childrenDetails, trendTitle, trendEl, footEl);
    emptySlot = el2("div", "empty-slot");
    wrap.append(head, subEl, tabsSlot, bannerSlot, bodyEl, settingsEl, emptySlot);
    root.append(wrap);
    refreshHandle = mountButton(refreshSlot, {
      label: t.refresh,
      size: "xs",
      variant: "outline",
      onClick: () => void refresh()
    });
    tabsHandle = mountTabs(tabsSlot, {
      items: [
        { id: "total", label: t.scopeAll },
        { id: "main", label: t.scopeMain }
      ],
      activeId: scope,
      onChange: (id) => {
        scope = id === "main" ? "main" : "total";
        renderBody();
      }
    });
    billingAddHandle = mountButton(billingAddSlot, {
      label: `\uFF0B ${t.billingAdd}`,
      size: "xs",
      variant: "outline",
      onClick: () => {
        rules = [...rules, { provider: "", model: "" }];
        renderBilling();
      }
    });
    holidaySyncHandle = mountButton(holidaySyncSlot, {
      label: t.holidaySync,
      size: "xs",
      variant: "outline",
      onClick: () => void syncHolidayData()
    });
  }
  function setCell(cell, value, sub = "", tooltip) {
    cell.value.textContent = value;
    cell.sub.textContent = sub;
    if (tooltip !== void 0) cell.value.title = tooltip;
  }
  function setTokenCell(cell, n, tooltip) {
    setCell(cell, fmtTokens(n), n >= 1e3 ? fmtInt(n) : "", tooltip ?? fmtInt(n));
  }
  function showEmpty(title, body, action) {
    if (!built) return;
    emptyHandle?.dispose();
    emptyHandle = mountEmpty(emptySlot, { title, body, action });
    emptySlot.hidden = false;
    bodyEl.hidden = true;
  }
  function hideEmpty() {
    if (!built) return;
    emptyHandle?.dispose();
    emptyHandle = null;
    emptySlot.hidden = true;
    bodyEl.hidden = false;
  }
  function setBanner(tone2, title, body, retry) {
    if (!built) return;
    bannerHandle?.dispose();
    bannerHandle = mountBanner(bannerSlot, {
      tone: tone2,
      title,
      body,
      action: retry ? { label: T().retry, onClick: () => void refresh() } : void 0
    });
  }
  function clearBanner() {
    bannerHandle?.dispose();
    bannerHandle = null;
  }
  function renderBody() {
    const report = lastReport;
    if (!built || !report) return;
    const t = T();
    const agg = scope === "total" ? report.total : report.main;
    const tok = agg.tokens;
    const totalNum = tok.total;
    setTokenCell(kTotal, totalNum, t.totalTip(fmtInt(totalNum)));
    setTokenCell(kInput, tok.input);
    setTokenCell(kOutput, tok.output + tok.reasoning, t.outputTip(fmtInt(tok.output), fmtInt(tok.reasoning)));
    setTokenCell(kReasoning, tok.reasoning);
    setTokenCell(kCacheRead, tok.cacheRead);
    setTokenCell(kCacheWrite, tok.cacheWrite);
    setCell(kHit, fmtPct(agg.hitRate), "");
    setCell(kRequests, fmtInt(agg.requests), "");
    setCell(kCost, moneyText(agg), "", costTipText(agg));
    modelsEl.textContent = "";
    if (!agg.byModel.length) {
      modelsEl.append(el2("div", "muted", "\u2014"));
    } else {
      for (const m of agg.byModel) {
        const row = el2("div", "model");
        const left = el2("div");
        const tag = m.billing === "official" ? t.billingTagOfficial : t.billingTagRecorded;
        left.append(el2("div", "m-name", m.model), el2("div", "m-sub", `${m.provider || "?"} \xB7 ${fmtInt(m.requests)} \xD7 \xB7 ${tag}`));
        const right = el2("div", "m-right");
        const costEl = el2("div", "m-cost", modelMoneyText(m));
        if (m.official) costEl.title = t.costPeakOff(fmtCny(m.official.peakCny), fmtCny(m.official.offCny));
        right.append(el2("div", "m-tokens", fmtTokens(m.tokens.total)), costEl);
        row.append(left, right);
        modelsEl.append(row);
      }
    }
    const showChildren = scope === "total" && report.children.length > 0;
    childrenDetails.hidden = !showChildren;
    if (showChildren) {
      childrenSummary.textContent = t.children(report.children.length);
      childListEl.textContent = "";
      for (const c of report.children) {
        const row = el2("div", "child");
        const left = el2("div");
        const sub = t.childSub(c.requests, fmtPct(c.hitRate)) + (c.descendants > 0 ? ` \xB7 ${t.childNested(c.descendants)}` : "");
        left.append(el2("div", "m-name", c.title || c.id), el2("div", "c-sub", sub));
        const right = el2("div", "c-right");
        const costEl = el2("div", "c-cost", moneyText(c));
        if (c.hasDeepseek) costEl.title = costTipText(c);
        right.append(el2("div", "c-tokens", fmtTokens(c.tokens.total)), costEl);
        row.append(left, right);
        childListEl.append(row);
      }
    }
    renderTrend(trendEl, agg.trend);
    subEl.textContent = `${report.session.title || report.session.id} \xB7 ${report.session.id}`;
    tabsHandle?.update({
      items: [
        { id: "total", label: t.scopeAll, count: report.children.length },
        { id: "main", label: t.scopeMain }
      ],
      activeId: scope
    });
    footEl.textContent = t.footer(report.db.schema);
  }
  function renderTrend(container, trend) {
    const t = T();
    container.textContent = "";
    const pts = trend.points;
    if (!pts.length) {
      container.append(el2("div", "muted", t.noTrend));
      return;
    }
    const W = 600;
    const H = 120;
    const PAD = 8;
    const vals = pts.map((p) => p[1]);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (max === min) max = min + 1;
    const x = (i) => PAD + (W - 2 * PAD) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
    const y = (v2) => H - PAD - (v2 - min) / (max - min) * (H - 2 * PAD);
    const coords = pts.map((p, i) => [x(i), y(p[1])]);
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "spark");
    svg.setAttribute("role", "img");
    const area = document.createElementNS(NS, "path");
    const areaD = `M ${coords[0][0].toFixed(1)} ${(H - PAD).toFixed(1)} L ` + coords.map((c) => `${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(" L ") + ` L ${coords[coords.length - 1][0].toFixed(1)} ${(H - PAD).toFixed(1)} Z`;
    area.setAttribute("d", areaD);
    area.setAttribute("fill", "currentColor");
    area.setAttribute("opacity", "0.12");
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", coords.map((c) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(area, line);
    container.append(svg);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    container.append(el2("div", "trend-meta", t.trendMeta(pts.length, fmtTokens(max), fmtTokens(vals[vals.length - 1]), fmtTokens(avg), trend.downsampled)));
    const times = el2("div", "trend-times");
    times.append(el2("span", "", fmtTime(pts[0][0])), el2("span", "", fmtTime(pts[pts.length - 1][0])));
    container.append(times);
  }
  async function fetchReport(sid) {
    if (MOCK) return { report: mockReport(sid) };
    let res;
    try {
      res = await host.serviceRequest({ method: "GET", path: "/session", query: { sessionId: sid } });
    } catch (err) {
      return {
        error: { title: T().serviceDown, message: T().serviceDownBody(err instanceof Error ? err.message : String(err)), retry: true }
      };
    }
    let payload = null;
    try {
      payload = JSON.parse(res.body);
    } catch {
      payload = null;
    }
    if (res.status === 200 && payload && payload.ok) return { report: payload };
    const code = typeof payload?.error === "string" ? payload.error : "unknown";
    const message = typeof payload?.message === "string" ? payload.message : "";
    if (res.status === 404 && code === "session-not-found") return { empty: true };
    if (res.status === 503 && code === "db-missing") {
      return { error: { title: T().dbMissing, message: message || code, retry: true } };
    }
    return {
      error: {
        title: T().serviceDown,
        message: T().serviceDownBody(message || `${res.status} ${code}`),
        retry: true
      }
    };
  }
  async function refresh() {
    if (!built || loading) return;
    loading = true;
    refreshHandle?.update({ loading: true });
    updatedEl.textContent = lastReport ? updatedEl.textContent : T().loading;
    try {
      if (sessionId == null) {
        lastReport = null;
        clearBanner();
        showEmpty(T().notConnected, T().notConnectedBody);
        return;
      }
      const result = await fetchReport(sessionId);
      if (result.report) {
        lastReport = result.report;
        lastFetchAt = Date.now();
        clearBanner();
        hideEmpty();
        renderBody();
        updatedEl.textContent = T().updatedAt(fmtTime(lastFetchAt));
        void ensureConfig();
      } else if (result.empty) {
        lastReport = null;
        clearBanner();
        showEmpty(T().emptyTitle, T().emptyBody);
        updatedEl.textContent = "";
      } else if (result.error) {
        clearBanner();
        setBanner("error", result.error.title, result.error.message, result.error.retry);
        if (!lastReport) showEmpty(result.error.title, result.error.message, { label: T().retry, onClick: () => void refresh() });
      }
    } finally {
      loading = false;
      refreshHandle?.update({ loading: false });
    }
  }
  var rulesSignature = (list) => list.map((r) => `${r.provider}/${r.model}`).join("|");
  var providerLabel = (provider) => provider || T().billingUnknownProvider;
  function updateSettingsVisibility() {
    if (!built) return;
    settingsEl.hidden = config == null;
  }
  function applyConfigPayload(next) {
    const dirty = config != null && rulesSignature(rules) !== rulesSignature(config.config.billingModels);
    config = next;
    windowData = next.window ?? null;
    if (!dirty) rules = next.config.billingModels.map((r) => ({ ...r }));
    renderBilling();
    renderHolidays();
    renderPeak();
    updateSettingsVisibility();
  }
  function paintPeakTrack(phase, data, now) {
    const segs = daySegments(phase, data.peakWindows);
    const sig = segs.map((s) => `${s.from}-${s.to}-${s.peak ? 1 : 0}`).join("|");
    if (sig !== peakSig) {
      peakSig = sig;
      peakTrackEl.textContent = "";
      for (const s of segs) {
        const seg = el2("div", `peak-seg ${s.peak ? "high" : "low"}`);
        seg.style.width = `${(s.to - s.from) / 1440 * 100}%`;
        peakTrackEl.append(seg);
      }
      peakTrackEl.append(peakMarkerEl);
    }
    const pos = phase === "weekend" || phase === "holiday" ? blockProgress(now, data) : dayProgress(now);
    peakMarkerEl.style.left = `${pos}%`;
  }
  function renderPeak() {
    if (!built) return;
    if (!windowData || windowData.peakWindows.length === 0) {
      peakEl.hidden = true;
      return;
    }
    peakEl.hidden = false;
    const now = Date.now();
    const phase = phaseAt(now, windowData);
    peakEl.dataset.phase = phase;
    peakEl.classList.toggle("peak", phase === "peak");
    peakEl.classList.toggle("off", phase !== "peak");
    paintPeakTrack(phase, windowData, now);
    const text = stripText(now, windowData, lang);
    peakChipEl.textContent = text;
    const block = phase === "weekend" || phase === "holiday" ? lang === "zh" ? ` \xB7 \u672C\u6BB5 ${blockHours(now, windowData)} \u5C0F\u65F6` : ` \xB7 ${blockHours(now, windowData)}h block` : "";
    peakEl.title = `DeepSeek ${lang === "zh" ? "\u5CF0\u8C37" : "peak/off-peak"}\uFF1A${text}${block}`;
  }
  async function loadConfig() {
    if (!built) return;
    try {
      if (MOCK) {
        applyConfigPayload(mockConfig());
        return;
      }
      const res = await host.serviceRequest({ method: "GET", path: "/config" });
      if (res.status !== 200) throw new Error(`http-${res.status}`);
      applyConfigPayload(JSON.parse(res.body));
    } catch {
      config = null;
      updateSettingsVisibility();
    }
  }
  var lastConfigAt = 0;
  async function ensureConfig() {
    if (Date.now() - lastConfigAt < 6e4) return;
    lastConfigAt = Date.now();
    await loadConfig();
  }
  function disposeRuleHandles() {
    for (const h of ruleHandles) {
      h.provider.dispose();
      h.model.dispose();
      h.remove.dispose();
    }
    ruleHandles = [];
  }
  function renderBilling() {
    if (!built) return;
    const t = T();
    disposeRuleHandles();
    billingListEl.textContent = "";
    if (!config) return;
    const catalog = config.catalog ?? [];
    if (!rules.length) {
      billingListEl.append(el2("div", "muted", t.billingEmpty));
      return;
    }
    const providers = [.../* @__PURE__ */ new Set([...catalog.map((c) => c.provider), ...rules.map((r) => r.provider)])].sort(
      (a, b) => providerLabel(a).localeCompare(providerLabel(b))
    );
    const rerender = () => {
      setTimeout(() => renderBilling(), 0);
    };
    rules.forEach((rule, index) => {
      const row = el2("div", "rule");
      const providerSlot = el2("div", "rule-field");
      const modelSlot = el2("div", "rule-field");
      const delSlot = el2("div", "rule-del");
      const providerOptions = providers.map((p) => ({
        id: p,
        label: providerLabel(p),
        hint: String(catalog.filter((c) => c.provider === p).length)
      }));
      const modelOptions = catalog.filter((c) => c.provider === rule.provider).map((c) => ({
        id: c.model,
        label: c.model,
        hint: c.officialPriced ? `${fmtInt(c.requests)} \xD7` : `${fmtInt(c.requests)} \xD7 \xB7 ${t.billingUnpriceable}`
      }));
      if (rule.model && !modelOptions.some((o) => o.id === rule.model)) {
        modelOptions.unshift({ id: rule.model, label: rule.model });
      }
      const providerSel = mountSelect(providerSlot, {
        value: rule.provider,
        options: providerOptions,
        searchable: true,
        placeholder: t.billingPickProvider,
        searchPlaceholder: t.billingPickProvider,
        onChange: (id) => {
          rules[index] = { provider: id ?? "", model: "" };
          rerender();
          void saveRules();
        }
      });
      const modelSel = mountSelect(modelSlot, {
        value: rule.model || null,
        options: modelOptions,
        searchable: true,
        placeholder: t.billingPickModel,
        searchPlaceholder: t.billingPickModel,
        onChange: (id) => {
          rules[index] = { provider: rules[index]?.provider ?? "", model: id ?? "" };
          rerender();
          void saveRules();
        }
      });
      const removeHandle = mountButton(delSlot, {
        label: "\u2715",
        size: "xs",
        variant: "ghost",
        onClick: () => {
          rules = rules.filter((_, i) => i !== index);
          rerender();
          void saveRules();
        }
      });
      delSlot.title = t.billingRemove;
      row.append(providerSlot, modelSlot, delSlot);
      billingListEl.append(row);
      ruleHandles.push({ provider: providerSel, model: modelSel, remove: removeHandle });
    });
  }
  async function saveRules() {
    if (!built || savingRules) return;
    savingRules = true;
    const list = rules.filter((r) => r.model.trim() !== "");
    try {
      if (MOCK) {
        if (config) applyConfigPayload({ ...config, config: { ...config.config, seeded: true, billingModels: list } });
        return;
      }
      const res = await host.serviceRequest({
        method: "PUT",
        path: "/config",
        body: JSON.stringify({ billingModels: list })
      });
      if (res.status !== 200) throw new Error(`http-${res.status}`);
      applyConfigPayload(JSON.parse(res.body));
      void refresh();
    } catch (err) {
      setBanner("error", T().billingSaveFailed, err instanceof Error ? err.message : String(err), false);
    } finally {
      savingRules = false;
    }
  }
  function renderHolidays() {
    if (!built) return;
    const t = T();
    const status = config?.holidays;
    holidayLineEl.hidden = !status;
    holidaySyncSlot.hidden = !status;
    holidayNoteEl.hidden = !status;
    if (!config || !status) return;
    const parts = Object.keys(status.counts).sort().map((year) => `${year}\uFF08${status.counts[year]} \u5929\uFF09`);
    const synced = status.updatedAt ? t.holidaySynced(fmtDateTime(status.updatedAt)) : t.holidayNever;
    const extra = status.extra > 0 ? ` \xB7 ${t.holidayExtra(status.extra)}` : "";
    holidayLineEl.textContent = `${parts.length ? parts.join("\u3001") : t.holidayNone} \xB7 ${synced}${extra}`;
    holidayLineEl.title = config.paths.holidayCache;
  }
  async function syncHolidayData() {
    if (!built || syncingHolidays) return;
    syncingHolidays = true;
    holidaySyncHandle?.update({ loading: true, label: T().holidaySyncing });
    try {
      if (MOCK) return;
      const res = await host.serviceRequest({ method: "POST", path: "/holidays/sync" });
      if (res.status !== 200) throw new Error(`http-${res.status}`);
      const payload = JSON.parse(res.body);
      if (config && payload.holidays) config = { ...config, holidays: payload.holidays };
      renderHolidays();
      const synced = payload.synced ?? [];
      if (synced.length) setBanner("info", T().holidaySyncOk(synced.join("\u3001")), "", false);
      else setBanner("warning", T().holidaySyncFail, "", false);
    } catch (err) {
      setBanner("warning", T().holidaySyncFail, err instanceof Error ? err.message : String(err), false);
    } finally {
      syncingHolidays = false;
      holidaySyncHandle?.update({ loading: false, label: T().holidaySync });
    }
  }
  function boot() {
    if (booted) return;
    booted = true;
    void refresh();
    void loadConfig();
    setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15e3);
    setInterval(() => {
      if (!document.hidden) renderPeak();
    }, 3e4);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - lastFetchAt > 15e3) void refresh();
    });
  }
  function applyHostSession(sid) {
    if (sid === sessionId) return;
    sessionId = sid;
    lastReport = null;
    if (!built) return;
    renderBodyPlaceholder();
    updateSettingsVisibility();
    void refresh();
  }
  function renderBodyPlaceholder() {
    if (sessionId == null) showEmpty(T().notConnected, T().notConnectedBody);
    else if (!lastReport) showEmpty(T().loading, "");
  }
  if (MOCK) {
    lang = detectLang(params.get("lang") ?? void 0);
    document.documentElement.style.colorScheme = params.get("theme") === "light" ? "light" : "dark";
    const dark = params.get("theme") !== "light";
    document.documentElement.style.background = dark ? "#15171c" : "#ffffff";
    document.body.style.color = dark ? "#e8e8ea" : "#1b1b1f";
    document.body.style.minHeight = "100vh";
    sessionId = "ses_mock000000000000000000000000";
    buildDom();
    lastReport = mockReport(sessionId);
    hideEmpty();
    renderBody();
    applyConfigPayload(mockConfig());
    updatedEl.textContent = T().updatedAt(fmtTime(Date.now()));
  } else {
    host.onReady((ctx) => {
      applyHostReady(ctx, document.documentElement);
      lang = detectLang(ctx.locale);
      buildDom();
      applyHostSession(ctx.session?.id ?? null);
      boot();
    });
    host.onSession((snapshot) => {
      if (!built) return;
      applyHostSession(snapshot?.id ?? null);
    });
    setTimeout(() => {
      if (!built) {
        buildDom();
        showEmpty(T().notConnected, T().notConnectedBody);
      }
    }, 1500);
  }
  function mockReport(sid) {
    const now = Date.now();
    const points = [];
    let p = 9e3;
    for (let i = 0; i < 96; i++) {
      p = Math.max(2500, p * (0.9 + Math.random() * 0.22));
      points.push([now - (96 - i) * 4e4, Math.round(p)]);
    }
    const tok = (input, output, reasoning, cacheRead, cacheWrite) => ({
      input,
      output,
      reasoning,
      cacheRead,
      cacheWrite,
      total: input + output + reasoning + cacheRead + cacheWrite
    });
    const hit = (t) => t.cacheRead / (t.input + t.cacheRead + t.cacheWrite);
    const c = params.get("case");
    const ds = c !== "other";
    const ot = c !== "pure";
    const money = (cny, peak, off, usdOther, usdAll) => ({
      cost: usdAll,
      costCny: ds ? cny : 0,
      costCnyPeak: ds ? peak : 0,
      costCnyOff: ds ? off : 0,
      costUsdOther: ot ? usdOther : 0,
      hasDeepseek: ds,
      hasOther: ot
    });
    const dsMain = {
      model: "deepseek-flash",
      provider: "deepseek",
      requests: 71,
      tokens: tok(47e4, 24e3, 18e4, 56e5, 0),
      cost: 0.2,
      billing: "official",
      currency: "CNY",
      amount: 0.4193,
      official: { cny: 0.4193, peakCny: 0.1564, offCny: 0.2629 }
    };
    const otherMain = {
      model: "grok-4.7",
      provider: "xai",
      requests: 6,
      tokens: tok(37271, 3357, 14259, 209920, 0),
      cost: 0.02649,
      billing: "recorded",
      currency: "USD",
      amount: 0.02649,
      official: null
    };
    const dsTotal = {
      ...dsMain,
      requests: 88,
      tokens: tok(1e6, 3e4, 19e4, 6e6, 0),
      amount: 0.4528,
      official: { cny: 0.4528, peakCny: 0.1689, offCny: 0.2839 }
    };
    const otherTotal = { ...otherMain, requests: 8, tokens: tok(6e4, 5e3, 16e3, 22e4, 0), amount: 0.02624 };
    const mainTok = tok(507271, 27357, 194259, 5809920, 0);
    const childTok = tok(54820, 5858, 11805, 310016, 0);
    const totalTok = tok(
      mainTok.input + childTok.input,
      mainTok.output + childTok.output,
      mainTok.reasoning + childTok.reasoning,
      mainTok.cacheRead + childTok.cacheRead,
      mainTok.cacheWrite + childTok.cacheWrite
    );
    const mkChild = (id, title, startedAt, lastMessageAt, requests, tokens, rate, m) => ({ ...m, id, title, startedAt, lastMessageAt, requests, tokens, hitRate: rate, descendants: 0 });
    return {
      ok: true,
      generatedAt: now,
      db: { path: "~/.local/share/opencode/opencode.db", schema: "v2" },
      session: {
        id: sid,
        title: "\u7F51\u9875\u7248 LLM \u4E0E API Agent \u641C\u7D22\u5DEE\u5F02\u539F\u56E0",
        parentId: null,
        startedAt: now - 54e5,
        lastMessageAt: now - 6e4,
        childCount: 2,
        descendantCount: 2
      },
      main: {
        ...money(0.4193, 0.1564, 0.2629, 0.02649, (ds ? 0.2 : 0) + (ot ? 0.02649 : 0)),
        requests: 77,
        tokens: mainTok,
        hitRate: hit(mainTok),
        byModel: [...ds ? [dsMain] : [], ...ot ? [otherMain] : []],
        trend: { points: points.slice(0, 77), downsampled: false }
      },
      total: {
        ...money(0.4528, 0.1689, 0.2839, 0.02624, (ds ? 0.22 : 0) + (ot ? 0.02624 : 0)),
        requests: 96,
        tokens: totalTok,
        hitRate: hit(totalTok),
        byModel: [...ds ? [dsTotal] : [], ...ot ? [otherTotal] : []],
        trend: { points, downsampled: false }
      },
      children: [
        mkChild(
          "ses_mockchild1",
          "\u63D2\u8BDD\u4E0E\u5B50\u4F1A\u8BDD\u67E5\u8BC1",
          now - 36e5,
          now - 18e5,
          11,
          tok(47774, 3689, 10967, 270592, 0),
          0.85,
          ds ? money(0.0119, 44e-4, 75e-4, 0, 0.0119) : money(0, 0, 0, 0.01677, 0.01677)
        ),
        mkChild(
          "ses_mockchild2",
          "\u4F1A\u8BDD\u5B58\u50A8\u7ED3\u6784\u8C03\u67E5",
          now - 15e5,
          now - 9e5,
          8,
          tok(7046, 2169, 838, 39424, 0),
          0.85,
          ot ? money(0, 0, 0, 298e-5, 298e-5) : money(34e-4, 11e-4, 23e-4, 0, 34e-4)
        )
      ]
    };
  }
  function mockConfig() {
    const ds = params.get("case") !== "other";
    const ot = params.get("case") !== "pure";
    const catalog = [
      { provider: "opencode", model: "deepseek-v4.1-flash-free", requests: 36, billing: "recorded", officialPriced: false },
      { provider: "deepseek", model: "deepseek-flash", requests: 8, billing: ds ? "official" : "recorded", officialPriced: true },
      { provider: "deepseek", model: "deepseek-pro", requests: 2, billing: ds ? "official" : "recorded", officialPriced: true }
    ];
    if (ot) catalog.push({ provider: "xai", model: "grok-4.7", requests: 6, billing: "recorded", officialPriced: false });
    return {
      ok: true,
      config: {
        version: 1,
        seeded: true,
        billingModels: ds ? [
          { provider: "deepseek", model: "deepseek-flash" },
          { provider: "deepseek", model: "deepseek-pro" }
        ] : [],
        holidays: []
      },
      catalog,
      holidays: { counts: { "2026": 19 }, builtinYears: [2026], cacheYears: [], extra: 0, updatedAt: null },
      paths: {
        config: "~/.local/share/opencode/plugin-data/session-usage/session-usage.json",
        holidayCache: "~/.local/share/opencode/plugin-data/session-usage/session-usage-holidays.json"
      },
      window: {
        peakWindows: [
          [540, 720],
          [840, 1080]
        ],
        holidays: []
      }
    };
  }
})();
