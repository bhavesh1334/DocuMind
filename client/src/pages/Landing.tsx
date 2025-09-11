import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, User, LogIn, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateOrLoginUser, useLoginWithUsername } from '@/hooks/useApi';
import { User as UserType } from '@/lib/api';

interface LandingProps {
  onUserAuthenticated: (user: UserType) => void;
}

export const Landing = ({ onUserAuthenticated }: LandingProps) => {
  const [formData, setFormData] = useState({
    name: '',
    username: ''
  });
  const { toast } = useToast();

  // API hooks
  const createOrLoginUser = useCreateOrLoginUser();
  const loginWithUsername = useLoginWithUsername();

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name.",
        variant: "destructive",
      });
      return;
    }

    createOrLoginUser.mutate({ name: formData.name.trim() }, {
      onSuccess: (response) => {
        const { user } = response.data!;
        onUserAuthenticated(user);
      },
    });
  };

  const handleLoginWithUsername = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim()) {
      toast({
        title: "Error",
        description: "Please enter your username.",
        variant: "destructive",
      });
      return;
    }

    loginWithUsername.mutate({ username: formData.username.trim() }, {
      onSuccess: (response) => {
        const { user } = response.data!;
        onUserAuthenticated(user);
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome to DocuMind
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Upload, analyze, and chat with your documents using AI
          </p>
        </div>

        {/* Authentication Card */}
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Get Started</CardTitle>
            <CardDescription>
              Enter your name to create an account or login with your username
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="create" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="create" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  New User
                </TabsTrigger>
                <TabsTrigger value="login" className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Existing User
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create">
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="h-11"
                      required
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      We'll generate a unique username for you (e.g., @bhavesh1334)
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                    disabled={createOrLoginUser.isPending}
                  >
                    {createOrLoginUser.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      'Start Using DocuMind'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="login">
                <form onSubmit={handleLoginWithUsername} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter your username (e.g., @bhavesh1334)"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="h-11"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                    disabled={loginWithUsername.isPending}
                  >
                    {loginWithUsername.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging In...
                      </>
                    ) : (
                      'Login'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        
        <footer className="w-full py-4 text-center text-xs text-white/60 mt-8">
          Built with ❤️ by <a href="https://bhavesh.work" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors hover:underline underline-offset-4 italic">Bhavesh Chandrakar</a>
        </footer>
      </div>
    </div>
  );
};
