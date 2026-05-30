import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export const FileUploadContext = createContext(null);

const FileItemContext = createContext(null);

function useFileUpload() {
  const ctx = useContext(FileUploadContext);
  if (!ctx) throw new Error("Must be used inside <FileUpload>");
  return ctx;
}

function useFileItem() {
  const ctx = useContext(FileItemContext);
  if (!ctx) throw new Error("Must be used inside <FileUploadItem>");
  return ctx;
}

export function FileUpload({
  children,
  accept,
  maxFiles = 10,
  maxSize = 4 * 1024 * 1024,
  multiple = false,
  disabled = false,
  className = "",
  onAccept,
  onUpload,
  onFileReject,
}) {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const inputRef = useRef(null);

  const validateFile = useCallback(
    (file) => {
      if (maxSize && file.size > maxSize) {
        return `File size must be less than ${formatBytes(maxSize)}`;
      }
      return null;
    },
    [maxSize]
  );

  const handleFiles = useCallback(
    (incoming) => {
      const accepted = [];
      incoming.forEach((file) => {
        const err = validateFile(file);
        if (err) {
          onFileReject?.(file, err);
        } else {
          accepted.push(file);
        }
      });

      const combined = multiple
        ? [...files, ...accepted].slice(0, maxFiles)
        : accepted.slice(0, maxFiles);

      setFiles(combined);
      onAccept?.(combined);
    },
    [files, multiple, maxFiles, validateFile, onAccept, onFileReject]
  );

  const onProgress = useCallback((file, pct) => {
    setProgress((prev) => ({ ...prev, [file.name]: pct }));
  }, []);

  const triggerUpload = useCallback(async () => {
    if (!onUpload || files.length === 0) return;
    await onUpload(files, { onProgress });
  }, [files, onUpload, onProgress]);

  const removeFile = useCallback((file) => {
    setFiles((prev) => prev.filter((f) => f !== file));
    setProgress((prev) => {
      const next = { ...prev };
      delete next[file.name];
      return next;
    });
  }, []);

  return (
    <FileUploadContext.Provider
      value={{
        files,
        progress,
        accept,
        maxFiles,
        maxSize,
        multiple,
        disabled,
        inputRef,
        handleFiles,
        triggerUpload,
        removeFile,
      }}
    >
      <div className={className}>{children}</div>
    </FileUploadContext.Provider>
  );
}

export function FileUploadDropzone({ children }) {
  const { accept, multiple, disabled, inputRef, handleFiles } = useFileUpload();
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    handleFiles(dropped);
  };

  const onInputChange = (e) => {
    const selected = Array.from(e.target.files || []);
    handleFiles(selected);

    e.target.value = "";
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`
        file-upload-dropzone
        relative flex flex-col items-center justify-center gap-3 rounded-xl
        border border-dashed p-8 text-center cursor-pointer
        transition-all duration-200
        ${isDragging
          ? "border-white/40 bg-white/[0.04]"
          : "border-white/10 bg-[#080808] hover:border-white/20 hover:bg-white/[0.02]"
        }
        ${disabled ? "opacity-50 pointer-events-none" : ""}
      `}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={onInputChange}
        disabled={disabled}
      />
      {children}
    </div>
  );
}

export function FileUploadTrigger({ children, asChild = false }) {
  const { inputRef, disabled } = useFileUpload();

  const handleClick = (e) => {
    e.stopPropagation();
    if (!disabled) inputRef.current?.click();
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: handleClick });
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function FileUploadList({ children }) {
  const { files } = useFileUpload();

  return (
    <AnimatePresence>
      {files.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mt-4 space-y-2"
        >
          {children}
        </motion.ul>
      )}
    </AnimatePresence>
  );
}

export function FileUploadItem({ value: file, children }) {
  const { progress, removeFile } = useFileUpload();
  const filePct = progress[file.name] ?? 0;
  const isUploaded = filePct >= 100;

  return (
    <FileItemContext.Provider value={{ file, progress: filePct, isUploaded, removeFile }}>
      <motion.li
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        className="glass-panel rounded-xl px-4 py-3 flex flex-col gap-2"
      >
        {children}
      </motion.li>
    </FileItemContext.Provider>
  );
}

export function FileUploadItemPreview() {
  const { file } = useFileItem();
  const isImage = file.type.startsWith("image/");
  const [src, setSrc] = useState(null);

  React.useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const ext = file.name.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/5 border border-white/10 flex items-center justify-center">
      {isImage && src ? (
        <img src={src} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[9px] font-bold text-on-surface-variant">{ext}</span>
      )}
    </div>
  );
}

export function FileUploadItemMetadata() {
  const { file, progress: pct, isUploaded } = useFileItem();

  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-primary truncate">{file.name}</p>
      <p className="text-xs text-on-surface-variant">
        {formatBytes(file.size)}
        {pct > 0 && !isUploaded && (
          <span className="ml-2 text-white/50">{Math.round(pct)}%</span>
        )}
        {isUploaded && (
          <span className="ml-2 text-emerald-400 font-semibold">✓ Ready</span>
        )}
      </p>
    </div>
  );
}

export function FileUploadItemProgress() {
  const { progress: pct } = useFileItem();

  return (
    <div className="w-full h-[3px] rounded-full bg-white/10 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    </div>
  );
}

export function FileUploadItemDelete({ children, asChild = false }) {
  const { file, removeFile } = useFileItem();

  const handleClick = (e) => {
    e.stopPropagation();
    removeFile(file);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: handleClick });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="ml-auto p-1.5 rounded-md hover:bg-white/10 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
      aria-label="Remove file"
    >
      {children}
    </button>
  );
}
