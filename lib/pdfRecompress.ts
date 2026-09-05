import zlib from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFRef } from "pdf-lib";
import sharp from "sharp";

// Chrome's serverless (headless-shell) printToPDF re-rasterizes every photo into
// a LOSSLESS bitmap (FlateDecode) at its on-screen size instead of keeping the
// source JPEG. That made FLOW report PDFs 5-10x larger than they should be (a
// 26 MB report is ~2.7 MB with the photos stored as JPEG). This pass runs after
// printToPDF: it finds those raw-bitmap images and re-encodes them as JPEG
// (DCTDecode) in place — same pixels, a fraction of the bytes.
//
// It is deliberately conservative: anything unusual (alpha mask, CMYK, indexed
// colour, non-8-bit, a predictor, an unexpected byte length, an encode that
// wouldn't shrink) is skipped and left exactly as-is. It never throws; on any
// failure the caller keeps the original PDF.

function filterHas(dict: any, target: string): boolean {
  const f = dict.get(PDFName.of("Filter"));
  if (!f) return false;
  if (f instanceof PDFName) return f.asString() === target;
  if (f instanceof PDFArray) {
    return f.asArray().some((x: any) => x instanceof PDFName && x.asString() === target);
  }
  return false;
}

function channelsFromColorSpace(ctx: any, dict: any): number | null {
  const cs = dict.get(PDFName.of("ColorSpace"));
  if (!cs) return null;
  if (cs instanceof PDFName) {
    const n = cs.asString();
    if (n === "/DeviceRGB") return 3;
    if (n === "/DeviceGray") return 1;
    return null; // DeviceCMYK / anything else -> skip
  }
  let arr: any = cs;
  if (cs instanceof PDFRef) arr = ctx.lookup(cs);
  if (arr instanceof PDFArray) {
    const head = arr.get(0);
    if (head instanceof PDFName && head.asString() === "/ICCBased") {
      const strm: any = ctx.lookup(arr.get(1));
      const nObj: any = strm?.dict?.get(PDFName.of("N"));
      const N = nObj?.asNumber ? nObj.asNumber() : Number(nObj);
      if (N === 1 || N === 3) return N;
    }
  }
  return null;
}

export type RecompressResult = {
  bytes: Uint8Array;
  changed: boolean;
  recompressed: number;
  skipped: number;
};

export async function recompressPdfImages(
  input: Uint8Array,
  opts: { quality?: number } = {},
): Promise<RecompressResult> {
  const quality = opts.quality ?? 72;
  try {
    const doc = await PDFDocument.load(input, { updateMetadata: false });
    const ctx: any = doc.context;
    let recompressed = 0;
    let skipped = 0;

    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;

      const subtype = dict.get(PDFName.of("Subtype"));
      if (!(subtype instanceof PDFName) || subtype.asString() !== "/Image") continue;
      if (!filterHas(dict, "/FlateDecode")) continue;
      // Leave anything with alpha / masks / custom decode arrays untouched.
      if (dict.get(PDFName.of("SMask")) || dict.get(PDFName.of("Mask"))) { skipped++; continue; }
      if (dict.get(PDFName.of("ImageMask"))) { skipped++; continue; }
      if (dict.get(PDFName.of("Decode"))) { skipped++; continue; }
      if (dict.get(PDFName.of("DecodeParms")) || dict.get(PDFName.of("DP"))) { skipped++; continue; }

      const bpcObj: any = dict.get(PDFName.of("BitsPerComponent"));
      const bpc = bpcObj?.asNumber ? bpcObj.asNumber() : Number(bpcObj);
      if (bpc !== 8) { skipped++; continue; }

      const wObj: any = dict.get(PDFName.of("Width"));
      const hObj: any = dict.get(PDFName.of("Height"));
      const width = wObj?.asNumber ? wObj.asNumber() : Number(wObj);
      const height = hObj?.asNumber ? hObj.asNumber() : Number(hObj);
      if (!width || !height) { skipped++; continue; }

      const channels = channelsFromColorSpace(ctx, dict);
      if (!channels) { skipped++; continue; }

      let raw: Buffer;
      try {
        raw = zlib.inflateSync(Buffer.from(obj.contents));
      } catch {
        skipped++;
        continue;
      }
      if (raw.length !== width * height * channels) { skipped++; continue; }

      const before = obj.contents.length;
      let jpeg: Buffer;
      try {
        jpeg = await sharp(raw, { raw: { width, height, channels: channels as 1 | 3 } })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      } catch {
        skipped++;
        continue;
      }
      if (jpeg.length >= before) { skipped++; continue; } // never grow a stream

      const newDict = dict.clone(ctx);
      newDict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      newDict.set(PDFName.of("Length"), ctx.obj(jpeg.length));
      const newStream = PDFRawStream.of(newDict, new Uint8Array(jpeg));
      ctx.assign(ref, newStream);
      recompressed++;
    }

    if (recompressed === 0) {
      return { bytes: input, changed: false, recompressed: 0, skipped };
    }

    const out = await doc.save({ useObjectStreams: false });
    return { bytes: out, changed: true, recompressed, skipped };
  } catch (err) {
    // Any parse/save failure: hand back the original untouched.
    return { bytes: input, changed: false, recompressed: 0, skipped: 0 };
  }
}
