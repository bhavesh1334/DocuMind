import { useState } from 'react';
import { Header } from '@/components/Header';
import { FileUploadSection } from '@/components/FileUploadSection';
import { ChatInterface } from '@/components/ChatInterface';
import { AuthDialog } from '@/components/AuthDialog';
import { useToast } from '@/hooks/use-toast';

interface User {
  name: string;
  email: string;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleLogin = () => {
    setIsAuthDialogOpen(true);
  };

  const handleLogout = () => {
    setUser(null);
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
  };

  const handleAuthSuccess = (userData: User) => {
    setUser(userData);
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Header */}
      <Header user={user} onLogin={handleLogin} onLogout={handleLogout} />
      
      {/* Main Content */}
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Panel - File Upload */}
        <div className="w-96 flex-shrink-0">
          <FileUploadSection />
        </div>
        
        {/* Right Panel - Chat Interface */}
        <div className="flex-1">
          <ChatInterface />
        </div>
      </div>

      {/* Authentication Dialog */}
      <AuthDialog
        isOpen={isAuthDialogOpen}
        onOpenChange={setIsAuthDialogOpen}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default Index;
