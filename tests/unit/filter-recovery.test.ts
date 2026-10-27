import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ContentController } from "../../src/content";
import { StorageManager } from "../../src/core/storage";

describe("H1/H2 회귀 검증", () => {
  let originalLocation: any;
  beforeEach(async () => {
    await StorageManager.saveBlockList([]);
    await StorageManager.saveSettings({ mode: "hide", hideAds: true, enableInfiniteScroll: false, showJobplanetRating: false, showBlindRating: false });
    originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = new URL("https://www.wanted.co.kr/wdlist/518/872");
    (global as any).chrome = { storage: undefined, runtime: { lastError: null, onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, sendMessage: vi.fn() } };
    const raw = fs.readFileSync(path.resolve(path.resolve(__dirname, "../fixtures/wanted_wdlist.html")), "utf-8");
    document.body.innerHTML = raw.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  });
  afterEach(() => { (window as any).location = originalLocation; document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("회사 차단 해제 시 카드가 복원되어야 한다", async () => {
    await StorageManager.addBlockItem("미리디", "company", { platform: "wanted" });
    const c = new ContentController();
    await c.init();
    const el = document.querySelector('[data-filter-mode="hide"][data-blocked-type="company"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.display).toBe("none");

    // 차단 해제
    const list = await StorageManager.getBlockList(false);
    await StorageManager.removeBlockItem(list.find(i => i.pattern === "미리디")!.id);
    const updated = await StorageManager.getBlockList(false);
    const handler = (global as any).chrome.runtime.onMessage.addListener.mock.calls[0][0];
    handler({ type: "BLOCKLIST_CHANGED", items: updated }, {}, () => {});

    expect(el.getAttribute("data-job-filtered")).toBeNull();
    expect(el.style.display).not.toBe("none");
  });

  it("hideAds 를 끄면 광고 배너가 복원되어야 한다", async () => {
    const c = new ContentController();
    await c.init();
    const banner = document.querySelector('section[class*="AdTargetList_"]') as HTMLElement;
    expect(banner.style.display).toBe("none");

    const updated = await StorageManager.saveSettings({ hideAds: false });
    const handler = (global as any).chrome.runtime.onMessage.addListener.mock.calls[0][0];
    handler({ type: "SETTINGS_CHANGED", settings: updated }, {}, () => {});

    expect(banner.style.display).not.toBe("none");
    expect(banner.getAttribute("data-job-filtered")).toBeNull();
  });
});

