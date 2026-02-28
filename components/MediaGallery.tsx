'use client';

import { useEffect, useMemo, useState } from 'react';

type MediaGalleryProps = {
  imageFiles: string[];
};

export function MediaGallery({ imageFiles }: MediaGalleryProps) {
  const images = useMemo(() => imageFiles.map((file) => `/images/${file}`), [imageFiles]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const showImage = (index: number) => {
    if (index < 0) {
      setCurrentIndex(images.length - 1);
    } else if (index >= images.length) {
      setCurrentIndex(0);
    } else {
      setCurrentIndex(index);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        setIsOpen(false);
      } else if (event.key === 'ArrowRight') {
        showImage(currentIndex + 1);
      } else if (event.key === 'ArrowLeft') {
        showImage(currentIndex - 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex]);

  return (
    <>
      <div className="photo-gallery">
        {images.map((src, index) => (
          <img
            key={src}
            src={src}
            alt="Photo"
            onClick={() => {
              setCurrentIndex(index);
              setIsOpen(true);
            }}
          />
        ))}
      </div>

      <div
        className={`lightbox${isOpen ? ' active' : ''}`}
        id="lightbox"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setIsOpen(false);
          }
        }}
      >
        <img src={images[currentIndex]} alt="Enlarged photo" id="lightbox-img" />
      </div>
    </>
  );
}
