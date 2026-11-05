export function validateUpload(kind, name, bytes) {
  const image =
    kind === "clientLogo" || kind === "profilePhoto" || kind === "paymentQR";
  const n = name.toLowerCase();
  if (bytes.length < 8 || bytes.length > (image ? 3 : 8) * 1024 * 1024)
    throw new Error(
      image ? "Images must be under 3 MB" : "Documents must be under 8 MB",
    );
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (image) {
    if (png && n.endsWith(".png")) return "image/png";
    if (jpg && /\.jpe?g$/.test(n)) return "image/jpeg";
    if (webp && n.endsWith(".webp")) return "image/webp";
    throw new Error("Upload a PNG, JPG or WebP image");
  }
  if (
    n.endsWith(".pdf") &&
    String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
  )
    return "application/pdf";
  throw new Error("Upload the document as a PDF");
}

