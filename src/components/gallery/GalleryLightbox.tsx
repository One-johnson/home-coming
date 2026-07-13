"use client";

import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";

export type GalleryLightboxImage = {
  _id: string;
  imageUrl: string;
  caption?: string;
};

type GalleryLightboxProps = {
  images: GalleryLightboxImage[];
  activeIndex: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export function GalleryLightbox({
  images,
  activeIndex,
  onClose,
  onIndexChange,
}: GalleryLightboxProps) {
  const slides = images.map((image) => ({
    src: image.imageUrl,
    alt: image.caption ?? "Homecoming photo",
    title: image.caption,
    description: image.caption,
    thumbnail: image.imageUrl,
  }));

  return (
    <Lightbox
      className="homecoming-lightbox"
      open={activeIndex !== null}
      close={onClose}
      index={activeIndex ?? 0}
      slides={slides}
      plugins={[Thumbnails, Captions, Counter, Zoom, Slideshow]}
      on={{ view: ({ index }) => onIndexChange(index) }}
      carousel={{ finite: false, padding: 16, spacing: 0 }}
      animation={{ fade: 250, swipe: 300 }}
      controller={{ closeOnBackdropClick: true }}
      slideshow={{ autoplay: true, delay: 4000 }}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      thumbnails={{
        position: "bottom",
        width: 96,
        height: 64,
        border: 2,
        borderRadius: 6,
        borderColor: "rgba(255, 255, 255, 0.2)",
        gap: 8,
        padding: 12,
        vignette: false,
      }}
      captions={{
        hidden: false,
        descriptionTextAlign: "center",
        descriptionMaxLines: 3,
      }}
      styles={{
        container: { backgroundColor: "rgba(10, 10, 10, 0.92)" },
        thumbnailsContainer: { backgroundColor: "rgba(10, 10, 10, 0.6)" },
        captionsTitleContainer: { display: "none" },
        captionsDescription: {
          color: "rgba(250, 247, 242, 0.92)",
          fontFamily: "var(--font-body), system-ui, sans-serif",
          fontSize: "0.95rem",
          lineHeight: 1.5,
        },
        captionsDescriptionContainer: {
          backgroundColor: "transparent",
          padding: "0.5rem 1rem 0",
        },
        button: {
          filter: "none",
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          borderRadius: "9999px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        },
        navigationPrev: { padding: "1rem 0.75rem" },
        navigationNext: { padding: "1rem 0.75rem" },
      }}
    />
  );
}
