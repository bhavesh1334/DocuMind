import { useState, useRef, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, Link, Type, Trash2, FileText, Image, FileSpreadsheet, Loader2, CheckCircle, AlertTriangle, LoaderCircle, Youtube, SquarePlay } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDocuments, useUploadFiles, useAddUrl, useAddText, useDeleteDocument } from '@/hooks/useApi';
import { Document } from '@/lib/api';

const SUPPORTED_FILE_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'csv',
  'text/plain': 'txt',
  'text/markdown': 'md',
} as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

interface User {
  id: string;
  name: string;
  username: string;
}

interface FileUploadSectionProps {
  user: User;
  hideHeader?: boolean;
}

export const FileUploadSection = ({ user, hideHeader = false }: FileUploadSectionProps) => {
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // API hooks
  const { data: documentsResponse, isLoading: isLoadingDocuments, refetch } = useDocuments({ limit: 50, userId: user.id });
  const uploadFiles = useUploadFiles();
  const addUrl = useAddUrl();
  const addText = useAddText();
  const deleteDocument = useDeleteDocument();
  
  const isUploading = uploadFiles.isPending || addUrl.isPending || addText.isPending;

  const documents = useMemo(() => {
    return documentsResponse?.data?.documents || []
  }, [documentsResponse]);

  const getFileIcon = (document: Document) => {
    if (document.type === 'youtube') return<SquarePlay className="h-4 w-4" />
    if (document.type === 'url') return <Link className="h-4 w-4" />;
    if (document.type === 'text') return <Type className="h-4 w-4" />;
    
    const mimeType = document.metadata?.mimeType?.toLowerCase() || document.fileType?.toLowerCase();
    if (mimeType?.includes('pdf')) return <FileText className="h-4 w-4" />;
    if (mimeType?.includes('doc') || mimeType?.includes('word')) return <FileText className="h-4 w-4" />;
    if (mimeType?.includes('csv') || mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return <FileSpreadsheet className="h-4 w-4" />;
    if (mimeType?.includes('image')) return <Image className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'processing':
        return <LoaderCircle className="h-4 w-4 animate-spin text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: Document['status']) => {
    const icon = getStatusIcon(status);
    if (!icon) return null;
    
    return (
      <div className="flex items-center gap-1" title={status}>
        {icon}
      </div>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File "${file.name}" is too large. Maximum size is 10MB.` };
    }

    // Check file type
    if (!SUPPORTED_FILE_TYPES[file.type as keyof typeof SUPPORTED_FILE_TYPES]) {
      return { valid: false, error: `File "${file.name}" has unsupported format. Supported formats: PDF, DOC, DOCX, CSV, TXT, MD, and images.` };
    }

    return { valid: true };
  };

  const validateFiles = (files: FileList): { valid: boolean; error?: string } => {
    if (files.length > MAX_FILES) {
      return { valid: false, error: `Too many files selected. Maximum is ${MAX_FILES} files.` };
    }

    for (const file of Array.from(files)) {
      const validation = validateFile(file);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validation = validateFiles(files);
    if (!validation.valid) {
      toast({
        title: "Upload failed",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    uploadFiles.mutate({ files, userId: user.id }, {
      onSuccess: (response) => {
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        refetch();
        
        const successCount = response?.data?.filter((item: any) => item.status === 'completed').length || 0;
        const duplicateCount = response?.data?.filter((item: any) => item.status === 'duplicate').length || 0;
        
        if (successCount > 0) {
          toast({
            title: "Files Uploaded",
            description: `${successCount} file(s) processed successfully${duplicateCount > 0 ? `, ${duplicateCount} duplicate(s) skipped` : ''}`,
          });
        } else if (duplicateCount > 0) {
          toast({
            title: "Duplicate Files",
            description: `${duplicateCount} file(s) already exist in your library`,
            variant: "destructive",
          });
        }
      },
    });
  };

  const handleUrlAdd = () => {
    const url = urlInput.trim();
    if (!url) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL starting with http:// or https://",
        variant: "destructive",
      });
      return;
    }

    addUrl.mutate({ url, userId: user.id }, {
      onSuccess: () => {
        setUrlInput('');
        refetch();
        toast({
          title: "URL Added",
          description: "URL has been processed and added to your library",
        });
      },
      onError: (error: any) => {
        if (error?.response?.status === 409) {
          toast({
            title: "Duplicate URL",
            description: "This URL has already been added to your library",
            variant: "destructive",
          });
        }
      },
    });
  };

  const handleTextAdd = () => {
    const text = textInput.trim();
    if (!text) return;

    if (text.length < 10) {
      toast({
        title: "Text too short",
        description: "Please enter at least 10 characters of text.",
        variant: "destructive",
      });
      return;
    }

    const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
    addText.mutate({ text, title, userId: user.id }, {
      onSuccess: () => {
        setTextInput('');
        refetch();
        toast({
          title: "Text Added",
          description: "Text has been processed and added to your library",
        });
      },
    });
  };

  const handleDeleteDocument = (id: string) => {
    setDeletingDocumentId(id);
    deleteDocument.mutate({ id, userId: user.id }, {
      onSuccess: () => {
        setDeletingDocumentId(null);
        refetch();
      },
      onError: () => {
        setDeletingDocumentId(null);
      }
    });
  };

  // ReactDropzone configuration
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    fileRejections
  } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxFiles: MAX_FILES,
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading,
    onDrop: (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        const errors = rejectedFiles.map(rejection => {
          const errorMessages = rejection.errors.map(error => {
            switch (error.code) {
              case 'file-too-large':
                return `File "${rejection.file.name}" is too large. Maximum size is 10MB.`;
              case 'file-invalid-type':
                return `File "${rejection.file.name}" has unsupported format. Supported formats: PDF, DOC, DOCX, CSV, TXT, MD, and images.`;
              case 'too-many-files':
                return `Too many files selected. Maximum is ${MAX_FILES} files.`;
              default:
                return `File "${rejection.file.name}" was rejected: ${error.message}`;
            }
          });
          return errorMessages.join(' ');
        });
        
        toast({
          title: "Upload failed",
          description: errors[0],
          variant: "destructive",
        });
        return;
      }
      
      if (acceptedFiles.length > 0) {
        const fileList = new DataTransfer();
        acceptedFiles.forEach(file => fileList.items.add(file));
        handleFileUpload(fileList.files);
      }
    }
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header - Only show on desktop */}
      {!hideHeader && (
        <div className="p-4 sm:p-6 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-1 sm:mb-2">Document Library</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Upload files, add URLs, or paste text to chat with your content
              </p>
            </div>
            {isLoadingDocuments && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-9 sm:h-10">
              <TabsTrigger value="upload" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Files</span>
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                <Link className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">URL</span>
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                <Type className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Text</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4 sm:mt-6">
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                <Card 
                  className={`border-2 border-dashed transition-all duration-200 cursor-pointer ${
                    isDragActive && !isDragReject
                      ? 'border-primary bg-primary/5' 
                      : isDragReject
                      ? 'border-destructive bg-destructive/5'
                      : 'border-border hover:border-primary/50'
                  } ${isUploading ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <CardContent className="p-4 sm:p-8 text-center">
                    <Upload className={`h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-2 sm:mb-4 ${
                      isDragActive ? 'animate-bounce' : ''
                    }`} />
                    <p className="text-sm sm:text-lg font-medium text-foreground mb-1 sm:mb-2">
                      {isDragActive 
                        ? isDragReject 
                          ? 'Some files are not supported'
                          : 'Drop files here'
                        : 'Drop files here or click to upload'
                      }
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                      Supports PDF, DOC, CSV, and image files (max 10MB each)
                    </p>
                    <Button 
                      variant="outline"
                      className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-10"
                      disabled={isUploading}
                      type="button"
                    >
                      {isUploading ? (
                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                      {isUploading ? 'Uploading...' : 'Choose Files'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4 sm:mt-6">
              <div className="space-y-3 sm:space-y-4">
                <Input
                  placeholder="https://example.com/document"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="transition-smooth h-9 sm:h-10 text-sm sm:text-base"
                />
                <Button 
                  onClick={handleUrlAdd}
                  className="w-full gap-1 sm:gap-2 h-9 sm:h-10 text-sm sm:text-base"
                  disabled={!urlInput.trim() || isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Link className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  {isUploading ? 'Adding...' : 'Add URL'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="text" className="mt-4 sm:mt-6">
              <div className="space-y-3 sm:space-y-4">
                <Textarea
                  placeholder="Paste your text content here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="min-h-24 sm:min-h-32 transition-smooth resize-none text-sm sm:text-base"
                />
                <Button 
                  onClick={handleTextAdd}
                  className="w-full gap-1 sm:gap-2 h-9 sm:h-10 text-sm sm:text-base"
                  disabled={!textInput.trim() || isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Type className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  {isUploading ? 'Adding...' : 'Add Text'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Documents List */}
          {documents.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-sm sm:text-base font-medium text-foreground">Documents ({documents.length})</h3>
              <div className="space-y-2">
                {documents.map((document) => (
                  <Card key={document.id || document._id} className="group transition-all duration-200 hover:shadow-md relative">
                    <CardContent className="p-3 sm:p-4">
                      
                      <div className="flex items-center justify-between ">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 text-primary">
                            {getFileIcon(document)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                                {document.type === 'youtube' && document.metadata?.author 
                                  ? `${document.title} - ${document.metadata.author}`
                                  : document.title
                                }
                              </p>
                              {getStatusBadge(document.status)}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {document.type === 'youtube' && document.metadata?.durationFormatted && (
                                <p className="text-xs text-muted-foreground">
                                  {document.metadata.durationFormatted}
                                </p>
                              )}
                              {(document.metadata?.fileSize || document.metadata?.size) && (
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(document.metadata.fileSize || document.metadata.size!)}
                                </p>
                              )}
                              {document.metadata?.pages && (
                                <p className="text-xs text-muted-foreground">
                                  {document.metadata.pages} pages
                                </p>
                              )}
                              {document.metadata?.originalName && document.type === 'file' && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {document.metadata.originalName}
                                </p>
                              )}
                              {document.status === 'processing' && (
                                <p className="text-xs text-yellow-600">
                                  Processing...
                                </p>
                              )}
                              {document.status === 'failed' && document.error && (
                                <p className="text-xs text-red-600 truncate" title={document.error}>
                                  Error: {document.error}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                   
                        <div className="flex items-center gap-2">
                          {/* {document.status === 'completed' && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-green-200">
                              Ready
                            </Badge>
                          )}
                          {document.status === 'processing' && (
                            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200">
                              Processing
                            </Badge>
                          )}
                          {document.status === 'failed' && (
                            <Badge variant="destructive" className="text-xs">
                              Failed
                            </Badge>
                          )} */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(document.id || document._id!)}
                            disabled={deletingDocumentId === (document.id || document._id) || document.status === 'processing'}
                            className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 p-0 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            {deletingDocumentId === (document.id || document._id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {!isLoadingDocuments && documents.length === 0 && (
            <div className="text-center py-6 sm:py-8">
              <FileText className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <p className="text-xs sm:text-sm text-muted-foreground px-4">
                No documents yet. Upload files, add URLs, or paste text to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};