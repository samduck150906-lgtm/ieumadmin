'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, File, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

/** documents, realtor-docs 버킷은 private → onUpload에는 path가 전달되며, 표시 시 /api/documents/signed-url 또는 /api/realtors/[id]/document-urls 로 signed URL 발급 필요 */
interface FileUploadProps {
  bucket: 'profiles' | 'documents' | 'qrcodes' | 'realtor-docs';
  folder?: string;
  /** 모바일 카메라/앨범: image/* 또는 image/jpeg,image/png 등 MIME 타입 권장 */
  accept?: string;
  maxSize?: number; // MB
  onUpload: (urlOrPath: string, path: string) => void;
  onError?: (error: string) => void;
  currentUrl?: string;
  label?: string;
  description?: string;
}

export default function FileUpload({
  bucket,
  folder = '',
  accept = 'image/*',
  maxSize = 5,
  onUpload,
  onError,
  currentUrl,
  label = '파일 업로드',
  description = '클릭하거나 파일을 드래그하세요',
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    // 파일 크기 체크
    if (file.size > maxSize * 1024 * 1024) {
      onError?.(`파일 크기는 ${maxSize}MB 이하여야 합니다.`);
      return;
    }

    // 미리보기 생성 (이미지인 경우)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }

    setUploading(true);
    setProgress(0);

    try {
      const supabase = getSupabase();
      // 파일명 생성 (충돌 방지)
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const filePath = folder ? `${folder}/${fileName}` : fileName;

      // 업로드
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // private 버킷(documents, realtor-docs)은 path만 저장·반환. 조회 시 서버 API에서 createSignedUrl() 사용.
      const isPrivateBucket = bucket === 'documents' || bucket === 'realtor-docs';
      const displayUrl = isPrivateBucket
        ? data.path
        : supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;

      setProgress(100);
      onUpload(displayUrl, data.path);
    } catch (error: any) {
      console.error('업로드 오류:', error);
      onError?.(error.message || '업로드 중 오류가 발생했습니다.');
      setPreview(currentUrl || null);
    } finally {
      setUploading(false);
    }
  }, [bucket, folder, maxSize, onUpload, onError, currentUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = async () => {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const isImage = accept.includes('image');

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      <div
        className={`relative border-2 border-dashed rounded-xl transition-all ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'pointer-events-none' : 'cursor-pointer'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={uploading}
        />

        {preview && isImage ? (
          // 이미지 미리보기 (blob URL은 next/image 최적화 불가)
          <div className="relative aspect-video">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="미리보기"
              className="w-full h-full object-cover rounded-lg"
            />
            {!uploading && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                <div className="text-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <span>{progress}%</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          // 업로드 영역
          <div className="p-8 text-center">
            {uploading ? (
              <div>
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500">업로드 중... {progress}%</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  {isImage ? (
                    <ImageIcon className="w-8 h-8 text-gray-400" aria-hidden />
                  ) : (
                    <File className="w-8 h-8 text-gray-400" aria-hidden />
                  )}
                </div>
                <p className="text-gray-600 font-medium">{description}</p>
                <p className="text-sm text-gray-400 mt-2">
                  최대 {maxSize}MB · {accept.replace('/*', '').replace('image', '이미지')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 다중 파일 업로드 컴포넌트
interface MultiFileUploadProps {
  bucket: 'profiles' | 'documents' | 'qrcodes' | 'realtor-docs';
  folder?: string;
  /** 모바일: image/* 또는 application/pdf,image/jpeg 등 MIME 타입 권장 */
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  onUpload: (files: { url: string; path: string; name: string }[]) => void;
  onError?: (error: string) => void;
  label?: string;
}

export function MultiFileUpload({
  bucket,
  folder = '',
  accept = '*/*',
  maxSize = 10,
  maxFiles = 5,
  onUpload,
  onError,
  label = '파일 업로드',
}: MultiFileUploadProps) {
  const [files, setFiles] = useState<{ url: string; path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    if (files.length + fileList.length > maxFiles) {
      onError?.(`최대 ${maxFiles}개까지 업로드 가능합니다.`);
      return;
    }

    setUploading(true);
    const newFiles: { url: string; path: string; name: string }[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > maxSize * 1024 * 1024) {
        onError?.(`${file.name}: 파일 크기 초과 (최대 ${maxSize}MB)`);
        continue;
      }

      try {
        const supabase = getSupabase();
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = folder ? `${folder}/${fileName}` : fileName;

        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(filePath, file);

        if (error) throw error;

        const isPrivateBucket = bucket === 'documents' || bucket === 'realtor-docs';
        const displayUrl = isPrivateBucket
          ? data.path
          : supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;

        newFiles.push({
          url: displayUrl,
          path: data.path,
          name: file.name,
        });
      } catch (error: any) {
        onError?.(`${file.name}: ${error.message}`);
      }
    }

    const allFiles = [...files, ...newFiles];
    setFiles(allFiles);
    onUpload(allFiles);
    setUploading(false);
  };

  const handleRemove = async (index: number) => {
    const file = files[index];
    try {
      const supabase = getSupabase();
      await supabase.storage.from(bucket).remove([file.path]);
    } catch (error) {
      console.error('파일 삭제 오류:', error);
    }

    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onUpload(newFiles);
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      {/* 파일 목록 */}
      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <File className="w-5 h-5 text-gray-400" />
              <span className="flex-1 text-sm truncate">{file.name}</span>
              <Check className="w-4 h-4 text-green-500" />
              <button
                onClick={() => handleRemove(index)}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 업로드 영역 */}
      {files.length < maxFiles && (
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
            disabled={uploading}
          />
          {uploading ? (
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                클릭하여 파일 선택 ({files.length}/{maxFiles})
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
