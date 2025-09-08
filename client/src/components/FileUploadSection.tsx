import { useState, useRef, useMemo } from 'react';
import { Upload, File, Link, Type, X, FileText, Image, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
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
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
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
}

export const FileUploadSection = ({ user }: FileUploadSectionProps) => {
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // API hooks
  const { data: documentsResponse, isLoading: isLoadingDocuments, refetch } = useDocuments({ limit: 50, userId: user.id });
  const uploadFiles = useUploadFiles();
  const addUrl = useAddUrl();
  const addText = useAddText();
  const deleteDocument = useDeleteDocument();
  
  const isUploading = uploadFiles.isPending || addUrl.isPending || addText.isPending;

  console.log(documentsResponse,"Documet Response")
  const documents = useMemo(() => {
    return documentsResponse?.data?.documents || []
  }, [documentsResponse]);

  const getFileIcon = (document: Document) => {
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
        return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: Document['status']) => {
    const variants = {
      processing: 'secondary',
      completed: 'default',
      failed: 'destructive',
    } as const;
    
    return (
      <Badge variant={variants[status]} className="text-xs capitalize">
        {status}
      </Badge>
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
      onSuccess: () => {
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        refetch();
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
      },
    });
  };

  const handleDeleteDocument = (id: string) => {
    deleteDocument.mutate(id, {
      onSuccess: () => {
        refetch();
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Document Library</h2>
            <p className="text-sm text-muted-foreground">
              Upload files, add URLs, or paste text to chat with your content
            </p>
          </div>
          {isLoadingDocuments && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Upload Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="h-4 w-4" />
                Files
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <Link className="h-4 w-4" />
                URL
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-2">
                <Type className="h-4 w-4" />
                Text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-6">
              <Card 
                className={`border-2 border-dashed transition-all duration-200 ${
                  isDragOver 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <CardContent className="p-8 text-center">
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2">
                    Drop files here or click to upload
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports PDF, DOC, CSV, and image files
                  </p>
                  <Button 
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="gap-2"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {isUploading ? 'Uploading...' : 'Choose Files'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.csv,.xlsx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="url" className="mt-6">
              <div className="space-y-4">
                <Input
                  placeholder="https://example.com/document"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="transition-smooth"
                />
                <Button 
                  onClick={handleUrlAdd}
                  className="w-full gap-2"
                  disabled={!urlInput.trim() || isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link className="h-4 w-4" />
                  )}
                  {isUploading ? 'Adding...' : 'Add URL'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="text" className="mt-6">
              <div className="space-y-4">
                <Textarea
                  placeholder="Paste your text content here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="min-h-32 transition-smooth resize-none"
                />
                <Button 
                  onClick={handleTextAdd}
                  className="w-full gap-2"
                  disabled={!textInput.trim() || isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Type className="h-4 w-4" />
                  )}
                  {isUploading ? 'Adding...' : 'Add Text'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Documents List */}
          {documents.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-medium text-foreground">Documents ({documents.length})</h3>
              <div className="space-y-2">
                {documents.map((document) => (
                  <Card key={document.id || document._id} className="transition-all duration-200 hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 text-primary">
                            {getFileIcon(document)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {document.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
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
                              {getStatusBadge(document.status)}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(document.id || document._id!)}
                          disabled={deleteDocument.isPending}
                          className="flex-shrink-0 h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          {deleteDocument.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {!isLoadingDocuments && documents.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                No documents yet. Upload files, add URLs, or paste text to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};