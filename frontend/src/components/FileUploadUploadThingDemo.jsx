import React, { useCallback, useContext, useState } from "react";
import { Upload, X, FileText, Table2, Archive, FileJson, File } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/lib/uploadthing";
import {
  FileUpload,
  FileUploadContext,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemProgress,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";

function FileTypeIcon({ file }) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const cls = "w-5 h-5 text-on-surface-variant";

  if (ext === "pdf")  return <FileText className={cls} />;
  if (["csv","xlsx","xls"].includes(ext)) return <Table2 className={cls} />;
  if (ext === "zip")  return <Archive className={cls} />;
  if (ext === "json") return <FileJson className={cls} />;
  return <File className={cls} />;
}

function UploadNowButton({ fileCount, isUploading }) {
  const { triggerUpload } = useContext(FileUploadContext);
  return (
    <button
      type="button"
      onClick={triggerUpload}
      disabled={isUploading}
      className={`
        px-5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
        ${isUploading
          ? "bg-white/5 text-on-surface-variant/40 border border-white/5 cursor-not-allowed"
          : "bg-primary text-black hover:opacity-90 active:scale-[0.97] cursor-pointer"
        }
      `}
    >
      {isUploading ? "Uploading..." : `Upload ${fileCount} ${fileCount === 1 ? "file" : "files"}`}
    </button>
  );
}

export function FileUploadUploadThingDemo({ onFilesUploaded, disabled = false, uploadDone = false, onReset }) {
  const [isUploading, setIsUploading] = useState(false);
  const [files, setFiles] = useState([]);

  const onUpload = useCallback(
    async (files, { onProgress }) => {
      try {
        setIsUploading(true);

        const res = await uploadFiles("datasetUploader", {
          files,
          onUploadProgress: ({ file, progress }) => {
            onProgress(file, progress);
          },
        });

        const uploadedFiles = files.map((file) => {
          const uploaded = res.find((item) => item.name === file.name);
          return Object.assign(file, {
            url: uploaded?.url || file.url || '',
            uploadThingKey: uploaded?.key || '',
          });
        });

        await onFilesUploaded?.(uploadedFiles);

        toast.success("Files uploaded successfully!", {
          description: (
            <div className="mt-2 space-y-1">
              {res.map((f) => (
                <div key={f.name} className="text-xs font-mono" style={{ color: "#4ade80" }}>
                  ✓ {f.name.length > 32 ? `${f.name.slice(0, 32)}…` : f.name}
                </div>
              ))}
            </div>
          ),
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload failed. Please try again."
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onFilesUploaded]
  );

  const onFileReject = useCallback((file, message) => {
    toast.warning("File rejected", {
      description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}…` : file.name}": ${message}`,
    });
  }, []);

  return (
    <FileUpload
      maxFiles={10}
      maxSize={50 * 1024 * 1024}
      className="w-full"
      onAccept={(accepted) => setFiles(accepted)}
      onUpload={onUpload}
      onFileReject={onFileReject}
      multiple
      disabled={isUploading || disabled || uploadDone}
    >

      <FileUploadDropzone>

        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white/[0.04] border border-white/10">
          <Upload className="w-6 h-6 text-on-surface-variant" />
        </div>

        <div className="space-y-1 text-center">
          <p className="text-sm font-bold text-primary">
            Drag &amp; drop files here
          </p>
          <p className="text-xs text-on-surface-variant">
            Any local file up to 50 MB each
          </p>
        </div>

        <FileUploadTrigger asChild>
          <button
            type="button"
            disabled={uploadDone || isUploading}
            className={`
              browse-files-button mt-1 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${(uploadDone || isUploading)
                ? 'bg-white/5 border border-white/5 text-on-surface-variant/40 cursor-not-allowed'
                : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-primary cursor-pointer'}
            `}
          >
            Browse files
          </button>
        </FileUploadTrigger>

        {isUploading && (
          <p className="text-xs text-on-surface-variant animate-pulse mt-1">
            Uploading… please wait
          </p>
        )}

        {uploadDone && !isUploading && (
          <div className="flex flex-col items-center gap-2 mt-1">
            <p className="text-xs text-emerald-400 font-semibold">✓ Upload complete</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReset?.(); }}
              className="text-xs text-on-surface-variant underline hover:text-primary transition-colors cursor-pointer"
            >
              Upload more files
            </button>
          </div>
        )}
      </FileUploadDropzone>

      {files.length > 0 && !uploadDone && (
        <div className="mt-4 flex items-center justify-between px-1">
          <p className="text-xs text-on-surface-variant">
            {isUploading
              ? "Uploading in progress..."
              : `${files.length} ${files.length === 1 ? "file" : "files"} ready to upload`}
          </p>
          <UploadNowButton fileCount={files.length} isUploading={isUploading} />
        </div>
      )}

      {uploadDone && (
        <div className="mt-4 flex items-center justify-between px-1">
          <p className="text-xs text-emerald-400 font-semibold">✓ {files.length} {files.length === 1 ? 'file' : 'files'} uploaded successfully</p>
          <button
            type="button"
            disabled
            className="px-5 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-on-surface-variant/40 border border-white/5 cursor-not-allowed"
          >
            Uploaded
          </button>
        </div>
      )}

      <FileUploadList>
        {files.map((file, index) => (
          <FileUploadItem key={`${file.name}-${index}`} value={file}>
            <div className="flex w-full items-center gap-2">

              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <FileTypeIcon file={file} />
              </div>

              <FileUploadItemMetadata />

              <FileUploadItemDelete asChild>
                <button
                  type="button"
                  className="
                    flex-shrink-0 w-7 h-7 flex items-center justify-center
                    rounded-md hover:bg-white/10 text-on-surface-variant
                    hover:text-primary transition-colors cursor-pointer
                  "
                >
                  <X className="w-4 h-4" />
                </button>
              </FileUploadItemDelete>
            </div>

            <FileUploadItemProgress />
          </FileUploadItem>
        ))}
      </FileUploadList>
    </FileUpload>
  );
}

export default FileUploadUploadThingDemo;
