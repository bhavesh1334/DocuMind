import { useState, useRef } from 'react';
import { Upload, File, Link, Type, X, FileText, Image, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: 'pdf' | 'doc' | 'csv' | 'image' | 'url' | 'text';
  url?: string;
}

export const FileUploadSection = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getFileIcon = (type: UploadedFile['type']) => {
    switch (type) {
      case 'pdf':
      case 'doc':
        return <FileText className="h-4 w-4" />;
      case 'csv':
        return <FileSpreadsheet className="h-4 w-4" />;
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'url':
        return <Link className="h-4 w-4" />;
      case 'text':
        return <Type className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileType = (file: File): UploadedFile['type'] => {
    const fileType = file.type.toLowerCase();
    if (fileType.includes('pdf')) return 'pdf';
    if (fileType.includes('doc') || fileType.includes('word')) return 'doc';
    if (fileType.includes('csv') || fileType.includes('spreadsheet')) return 'csv';
    if (fileType.includes('image')) return 'image';
    return 'doc'; // default
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;

    Array.from(files).forEach((file) => {
      const newFile: UploadedFile = {
        id: Date.now().toString() + Math.random(),
        name: file.name,
        size: file.size,
        type: getFileType(file),
      };

      setUploadedFiles((prev) => [...prev, newFile]);
      toast({
        title: "File uploaded successfully",
        description: `${file.name} has been added to your documents.`,
      });
    });
  };

  const handleUrlAdd = () => {
    if (!urlInput.trim()) return;

    const newFile: UploadedFile = {
      id: Date.now().toString(),
      name: urlInput.length > 50 ? urlInput.substring(0, 50) + '...' : urlInput,
      size: 0,
      type: 'url',
      url: urlInput,
    };

    setUploadedFiles((prev) => [...prev, newFile]);
    setUrlInput('');
    toast({
      title: "URL added successfully",
      description: "The URL content will be processed for your chat.",
    });
  };

  const handleTextAdd = () => {
    if (!textInput.trim()) return;

    const newFile: UploadedFile = {
      id: Date.now().toString(),
      name: textInput.length > 50 ? textInput.substring(0, 50) + '...' : textInput,
      size: new Blob([textInput]).size,
      type: 'text',
    };

    setUploadedFiles((prev) => [...prev, newFile]);
    setTextInput('');
    toast({
      title: "Text added successfully",
      description: "Your text content is ready for analysis.",
    });
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== id));
    toast({
      title: "File removed",
      description: "The file has been removed from your documents.",
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
    <div className="h-full flex flex-col bg-surface/50 border-r border-border">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card">
        <h2 className="text-xl font-semibold text-foreground mb-2">Document Library</h2>
        <p className="text-sm text-muted-foreground">
          Upload files, add URLs, or paste text to chat with your content
        </p>
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
                  >
                    <Upload className="h-4 w-4" />
                    Choose Files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.csv,.png,.jpg,.jpeg,.gif"
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
                  disabled={!urlInput.trim()}
                >
                  <Link className="h-4 w-4" />
                  Add URL
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
                  disabled={!textInput.trim()}
                >
                  <Type className="h-4 w-4" />
                  Add Text
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-medium text-foreground">Uploaded Documents ({uploadedFiles.length})</h3>
              <div className="space-y-2">
                {uploadedFiles.map((file) => (
                  <Card key={file.id} className="transition-all duration-200 hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 text-primary">
                            {getFileIcon(file.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {file.name}
                            </p>
                            {file.size > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          className="flex-shrink-0 h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};