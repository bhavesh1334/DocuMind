import { Header } from '@/components/Header';
import { FileUploadSection } from '@/components/FileUploadSection';
import { ChatInterface } from '@/components/ChatInterface';
import { useToast } from '@/hooks/use-toast';

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

  const handleLogout = () => {
    onLogout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Header */}
      <Header user={user} onLogout={handleLogout} />
      
      {/* Main Content */}
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Panel - File Upload */}
        <div className="w-80 lg:w-96 flex-shrink-0 min-w-0 border-r border-border bg-card/50">
          <FileUploadSection user={user} />
        </div>
        
        {/* Right Panel - Chat Interface */}
        <div className="flex-1 min-w-0">
          <ChatInterface user={user} />
        </div>
      </div>
    </div>
  );
};

export default Index;
