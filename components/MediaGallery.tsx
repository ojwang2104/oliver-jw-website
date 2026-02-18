'use client';

import { useEffect, useMemo, useState } from 'react';

const imageFiles = [
  'IMG_0492.jpeg',
  'IMG_0494.jpeg',
  'IMG_0731.jpeg',
  'IMG_0795.jpeg',
  'IMG_0908.jpeg',
  'IMG_0979.jpeg',
  'IMG_0990.jpeg',
  'IMG_1035.jpeg',
  'IMG_1522.jpeg',
  'IMG_1595.jpeg',
  'IMG_1615.jpeg',
  'IMG_1827.jpeg',
  'IMG_1882.jpeg',
  'IMG_1885.jpeg',
  'IMG_1954.jpeg',
  'IMG_1976.jpeg',
  'IMG_1981.jpeg',
  'IMG_2003.jpeg',
  'IMG_2047.jpeg',
  'IMG_2301.jpeg',
  'IMG_2314.jpeg',
  'IMG_2497.jpeg',
  'IMG_2674.jpeg',
  'IMG_2826.jpeg',
  'IMG_3003.jpeg',
  'IMG_4932.jpeg',
  'IMG_5714.jpeg',
  'IMG_6001.jpeg',
  'IMG_8096.jpeg',
  'IMG_8190.jpeg',
  'IMG_8227.jpeg',
  '161DB5AC-170F-459D-B904-31EB064733B5.jpeg',
  '2be095e355344d878577fb6120574761.jpeg',
];

export function MediaGallery() {
  const images = useMemo(() => imageFiles.map((file) => `/images/${file}`), []);
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
