import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { FileUploadSection } from '@/components/FileUploadSection';
import { ChatInterface } from '@/components/ChatInterface';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface User {
  id: string;
  name: string;
  username: string;
}

interface IndexProps {
  user: User;
  onLogout: () => void;
}

const Index = ({ user, onLogout }: IndexProps) => {
  const { toast } = useToast();
  const [isMobileUploadOpen, setIsMobileUploadOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Auto-close mobile sheet when switching to desktop
      if (!mobile && isMobileUploadOpen) {
        setIsMobileUploadOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobileUploadOpen]);

  const handleLogout = () => {
    onLogout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
  };

  const handleToggleUpload = () => {
    setIsMobileUploadOpen(!isMobileUploadOpen);
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Header */}
      <Header 
        user={user} 
        onLogout={handleLogout} 
        onToggleUpload={handleToggleUpload}
        showUploadButton={isMobile}
      />
      
      {/* Main Content */}
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Desktop Left Panel - File Upload (always visible on desktop) */}
        {!isMobile && (
          <div className="w-80 lg:w-96 flex-shrink-0 min-w-0 border-r border-border bg-card/50">
            <FileUploadSection user={user} hideHeader={false} />
          </div>
        )}
        
        {/* Chat Interface - Full width on mobile, remaining space on desktop */}
        <div className="flex-1 min-w-0 min-h-0">
          <ChatInterface user={user} />
        </div>
      </div>

      {/* Mobile Upload Sheet - Only render on mobile */}
      {isMobile && (
        <Sheet open={isMobileUploadOpen} onOpenChange={setIsMobileUploadOpen}>
          <SheetContent side="left" className="w-full sm:w-96 p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>Document Library</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              <FileUploadSection user={user} hideHeader={true} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

export default Index;
