import React from "react";
import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui-elements";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md p-8 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-3xl font-display font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-8">
          The quadrant you are looking for does not exist in this domain.
        </p>
        <Link href="/" className="px-6 py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity">
          Return to Dashboard
        </Link>
      </Card>
    </div>
  );
}
