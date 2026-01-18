'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HelpCircle, MessageSquare, FileText, Send } from 'lucide-react';

// Zoho SalesIQ Script Component
function ZohoSalesIQWidget() {
  useEffect(() => {
    // Load Zoho SalesIQ script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.innerHTML = `
      var $zoho = $zoho || {};
      $zoho.salesiq = $zoho.salesiq || {
        widgetcode: "YOUR_ZOHO_SALESIQ_WIDGET_CODE",
        values: {},
        ready: function() {}
      };
      var d = document;
      s = d.createElement("script");
      s.type = "text/javascript";
      s.id = "zsiqscript";
      s.defer = true;
      s.src = "https://salesiq.zoho.in/widget";
      t = d.getElementsByTagName("script")[0];
      t.parentNode.insertBefore(s, t);
    `;
    document.body.appendChild(script);

    return () => {
      // Cleanup: Remove script on unmount
      const existingScript = document.getElementById('zsiqscript');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  return null;
}

// FAQ Data
const faqData = {
  technical: [
    {
      question: 'How do I generate GS1-compliant labels?',
      answer: 'Navigate to Code Generation, select your SKU, enter batch and expiry details, and choose your output format (PDF, PNG, ZPL, or EPL). The system automatically generates GS1-compliant codes with FNC1 separators.',
    },
    {
      question: 'What is the difference between GTIN and internal GTIN?',
      answer: 'GTIN (Global Trade Item Number) is issued by GS1 and is globally recognized. Internal GTINs are system-generated identifiers valid only within India and may not be export-compliant. Always use customer-provided GS1-issued GTINs when available.',
    },
    {
      question: 'How do I upload SKUs via CSV?',
      answer: 'Go to SKU Master, click Import CSV, and upload a file with headers: sku_code, sku_name. The system will validate and import your SKUs. Ensure CSV format matches the download template for best results.',
    },
    {
      question: 'Can I scan products without handset activation?',
      answer: 'Yes. The scanner app works immediately after installation. No login, activation, or device registration is required. Scanning is available to all users.',
    },
    {
      question: 'How are duplicate scans handled?',
      answer: 'Duplicate scans are automatically detected and logged with status "DUPLICATE". They appear in scan logs and dashboard analytics but do not block the scan operation.',
    },
  ],
  billing: [
    {
      question: 'What is the trial activation fee?',
      answer: 'The trial activation fee is ₹5 (INR). This is a one-time payment to activate your 15-day free trial. After trial, you can choose a subscription plan.',
    },
    {
      question: 'How are scans billed?',
      answer: 'Unit-level scans are free. Box, carton, and pallet (SSCC) scans may be billed based on your subscription plan. Check your billing dashboard for usage details.',
    },
    {
      question: 'Can I purchase additional seats?',
      answer: 'Yes. Seats can be purchased as add-ons from the Billing page. Each seat allows one additional user to access the system.',
    },
    {
      question: 'Are printers and ERP integrations billed separately?',
      answer: 'No. Printer integrations are unlimited and free. One ERP integration per user is included free. Additional ERP integrations are not available as add-ons.',
    },
    {
      question: 'How do I view my invoices?',
      answer: 'All invoices, including trial activation invoices, are available in the Billing & Wallet section. You can view, download, and export invoice history.',
    },
  ],
  audit: [
    {
      question: 'How do I generate audit reports?',
      answer: 'Navigate to Reports > Audit Reports. You can filter by date range, product, batch, or scan type. Reports are exportable in CSV format for compliance purposes.',
    },
    {
      question: 'Are all scans audited?',
      answer: 'Yes. Every scan is logged with timestamp, IP address, device context, expiry status, and scan result. All actions are traceable in audit logs.',
    },
    {
      question: 'Can I export scan history for regulators?',
      answer: 'Yes. Scan logs can be exported from the Scan Logs page. The export includes all required fields for regulatory compliance and audit purposes.',
    },
    {
      question: 'How long is scan data retained?',
      answer: 'Scan data is retained according to your subscription plan. Contact support for specific retention policies and archival options.',
    },
  ],
  compliance: [
    {
      question: 'Is RxTrace compliant with Indian pharmaceutical regulations?',
      answer: 'RxTrace generates GS1-compliant codes suitable for pharmaceutical traceability in India. Ensure you use GS1-issued GTINs for full regulatory compliance.',
    },
    {
      question: 'What is the difference between GS1-issued and internal GTINs?',
      answer: 'GS1-issued GTINs are globally recognized and export-compliant. Internal GTINs are system-generated and valid only within India. Always prefer GS1-issued GTINs for regulatory compliance.',
    },
    {
      question: 'How do I ensure my labels are export-compliant?',
      answer: 'Use customer-provided GS1-issued GTINs. Internal GTINs are marked with status "RXTRACE INTERNAL" and are not suitable for export. Check GTIN status in SKU Master.',
    },
    {
      question: 'Can I customize label formats for different markets?',
      answer: 'Label formats (PDF, PNG, ZPL, EPL) are standardized for GS1 compliance. Custom formats may affect regulatory acceptance. Contact support for market-specific requirements.',
    },
  ],
};

export default function HelpSupportPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    companyName: '',
    email: '',
    category: '',
    priority: 'normal',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Simulate form submission (UI only - actual email sending would be handled by backend)
    setTimeout(() => {
      setSubmitted(true);
      setSubmitting(false);
      setFormData({
        fullName: '',
        companyName: '',
        email: '',
        category: '',
        priority: 'normal',
        message: '',
      });
      
      // Reset success message after 5 seconds
      setTimeout(() => setSubmitted(false), 5000);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-gray-900 mb-1.5">Help & Support</h1>
        <p className="text-sm text-gray-600">Get assistance with technical issues, billing, and compliance</p>
      </div>

      {/* Zoho SalesIQ Widget - Only visible on this page */}
      <ZohoSalesIQWidget />

      {/* Tabs */}
      <Tabs defaultValue="faq" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="support">Support Request</TabsTrigger>
          <TabsTrigger value="contact">Live Chat</TabsTrigger>
        </TabsList>

        {/* FAQ Tab */}
        <TabsContent value="faq" className="space-y-6">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Frequently Asked Questions
              </CardTitle>
              <CardDescription>
                Find answers to common questions about RxTrace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="technical" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6">
                  <TabsTrigger value="technical">Technical</TabsTrigger>
                  <TabsTrigger value="billing">Billing</TabsTrigger>
                  <TabsTrigger value="audit">Audit</TabsTrigger>
                  <TabsTrigger value="compliance">Compliance</TabsTrigger>
                </TabsList>

                <TabsContent value="technical">
                  <Accordion type="single" collapsible className="w-full">
                    {faqData.technical.map((item, index) => (
                      <AccordionItem key={index} value={`tech-${index}`}>
                        <AccordionTrigger className="text-left font-medium text-gray-900">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>

                <TabsContent value="billing">
                  <Accordion type="single" collapsible className="w-full">
                    {faqData.billing.map((item, index) => (
                      <AccordionItem key={index} value={`billing-${index}`}>
                        <AccordionTrigger className="text-left font-medium text-gray-900">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>

                <TabsContent value="audit">
                  <Accordion type="single" collapsible className="w-full">
                    {faqData.audit.map((item, index) => (
                      <AccordionItem key={index} value={`audit-${index}`}>
                        <AccordionTrigger className="text-left font-medium text-gray-900">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>

                <TabsContent value="compliance">
                  <Accordion type="single" collapsible className="w-full">
                    {faqData.compliance.map((item, index) => (
                      <AccordionItem key={index} value={`compliance-${index}`}>
                        <AccordionTrigger className="text-left font-medium text-gray-900">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Support Request Tab */}
        <TabsContent value="support">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Submit Support Request
              </CardTitle>
              <CardDescription>
                Send your query to customer.support@rxtrace.in
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-green-800 font-medium mb-1">Request submitted successfully</p>
                  <p className="text-sm text-green-700">We will respond to your query at the provided email address.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName">Full Name *</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        required
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="companyName">Company Name *</Label>
                      <Input
                        id="companyName"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        required
                        className="mt-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="mt-1.5"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Support Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                        required
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technical">Technical Issue</SelectItem>
                          <SelectItem value="billing">Billing Query</SelectItem>
                          <SelectItem value="audit">Audit / Compliance</SelectItem>
                          <SelectItem value="general">General Question</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="priority">Priority (Optional)</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value) => setFormData({ ...formData, priority: value })}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      required
                      rows={6}
                      className="mt-1.5"
                      placeholder="Describe your issue or question in detail..."
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                      {submitting ? 'Submitting...' : 'Submit Request'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Live Chat Tab */}
        <TabsContent value="contact">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Live Chat Support
              </CardTitle>
              <CardDescription>
                Chat with our support team for immediate assistance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
                <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-700 font-medium mb-2">Zoho SalesIQ Chat Widget</p>
                <p className="text-sm text-gray-600 mb-4">
                  The chat widget is loaded on this page. Look for the chat icon in the bottom-right corner to start a conversation.
                </p>
                <p className="text-xs text-gray-500">
                  Available for: Technical issues, Billing queries, Audit & Compliance questions
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
