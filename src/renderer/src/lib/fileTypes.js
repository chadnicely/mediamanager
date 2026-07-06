// File-type catalog, grouped by category. Kept in its own module (not in a
// component file) so React Fast Refresh can hot-swap ScanImport cleanly.
export const CATEGORIES = {
  Image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'svg', 'avif', 'heic', 'ico', 'raw', 'cr2', 'nef', 'dng'],
  Video: ['mp4', 'mov', 'flv', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'mpeg', 'mpg', '3gp'],
  Audio: ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'wma', 'aiff', 'opus'],
  Document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'pages', 'key', 'md'],
  Design: ['psd', 'ai', 'fig', 'sketch', 'xd', 'eps', 'indd', 'afdesign', 'afphoto', 'procreate'],
  Archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso']
}

// Friendly, human-readable descriptions so people needn't know file extensions.
export const CATEGORY_META = {
  Image: { icon: '🖼', blurb: 'JPG, PNG, GIF, HEIC…' },
  Video: { icon: '🎬', blurb: 'MP4, MOV, AVI, MKV…' },
  Audio: { icon: '🎵', blurb: 'MP3, M4A, WAV, FLAC…' },
  Document: { icon: '📄', blurb: 'PDF, Word, Excel, PowerPoint…' },
  Design: { icon: '🎨', blurb: 'PSD, Illustrator, Figma…' },
  Archive: { icon: '🗜️', blurb: 'ZIP, RAR, 7z…' }
}
