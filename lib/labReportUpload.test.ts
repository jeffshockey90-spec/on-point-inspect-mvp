import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadLabReportPdf } from "./labReportUpload";

function makePdfFile(name = "report.pdf", size = 1024) {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

describe("uploadLabReportPdf", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects non-PDF files without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadLabReportPdf(
        new File(["x"], "photo.png", { type: "image/png" }),
        "insp-1",
        "mold",
      ),
    ).rejects.toThrow("Please choose a PDF file.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects files over the size limit without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const big = makePdfFile("big.pdf", 26 * 1024 * 1024);

    await expect(uploadLabReportPdf(big, "insp-1", "mold")).rejects.toThrow(
      "That PDF is over 25 MB. Please use a smaller file.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the URL on a successful upload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://example.com/report.pdf" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = await uploadLabReportPdf(makePdfFile(), "insp-1", "mold");
    expect(url).toBe("https://example.com/report.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a network-looking failure and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Load failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://example.com/report.pdf" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const promise = uploadLabReportPdf(makePdfFile(), "insp-1", "mold");
    await vi.runAllTimersAsync();
    const url = await promise;

    expect(url).toBe("https://example.com/report.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives a friendly, connection-focused message once retries are exhausted", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Load failed"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = uploadLabReportPdf(makePdfFile(), "insp-1", "mold");
    const assertion = expect(promise).rejects.toThrow(
      "Couldn't upload the PDF - check your connection and try again.",
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-network server error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Report not found." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadLabReportPdf(makePdfFile(), "insp-1", "mold"),
    ).rejects.toThrow("Report not found.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
