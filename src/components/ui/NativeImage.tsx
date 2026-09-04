import type { ImgHTMLAttributes } from "react";

type NativeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
};

/**
 * Keeps native browser image behavior for uploads, blob previews, QR codes,
 * print content, and panorama sources that cannot use Next image optimization.
 */
export default function NativeImage({
  alt,
  decoding = "async",
  loading = "lazy",
  ...props
}: NativeImageProps) {
  // Native rendering is intentional for dynamic sources outside Next's image pipeline.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} decoding={decoding} loading={loading} {...props} />;
}
