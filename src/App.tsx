import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/layout/DesktopSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnboardingGuide from "@/components/OnboardingGuide";
import { I18nProvider } from "@/contexts/I18nContext";
import { Loader2 } from "lucide-react";

// Eagerly loaded (critical path)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy loaded pages
const Shop = lazy(() => import("./pages/Shop"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Service = lazy(() => import("./pages/Service"));
const Vehicles = lazy(() => import("./pages/Vehicles"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const Contact = lazy(() => import("./pages/Contact"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const MyVehicles = lazy(() => import("./pages/MyVehicles"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AiMechanic = lazy(() => import("./pages/AiMechanic"));
const Terms = lazy(() => import("./pages/Terms"));
const Emergency = lazy(() => import("./pages/Emergency"));
const ServicePlan = lazy(() => import("./pages/ServicePlan"));
const ServiceBook = lazy(() => import("./pages/ServiceBook"));
const MyServiceOrders = lazy(() => import("./pages/MyServiceOrders"));
const AppPresentation = lazy(() => import("./pages/AppPresentation"));
const VehicleOffer = lazy(() => import("./pages/VehicleOffer"));
const EPC = lazy(() => import("./pages/EPC"));
const MechanicDashboard = lazy(() => import("./pages/MechanicDashboard"));
const OBDDiagnostics = lazy(() => import("./pages/OBDDiagnostics"));
const Garage = lazy(() => import("./pages/Garage"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <I18nProvider>
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <OnboardingGuide />
              <TopBar />
              <div className="flex w-full">
                <DesktopSidebar />
                <div className="flex-1 min-w-0">
                  <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/shop" element={<Shop />} />
                    <Route path="/epc" element={<EPC />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/service" element={<Service />} />
                    <Route path="/vehicles" element={<Vehicles />} />
                    <Route path="/vehicles/:id" element={<VehicleDetail />} />
                    <Route path="/vehicle-offer" element={<VehicleOffer />} />
                    <Route path="/garage" element={<Garage />} />
                    <Route path="/account" element={<Account />} />
                    <Route path="/orders" element={<MyOrders />} />
                    <Route path="/my-vehicles" element={<MyVehicles />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/ai-mechanic" element={<AiMechanic />} />
                    <Route path="/emergency" element={<Emergency />} />
                    <Route path="/service-plan" element={<ServicePlan />} />
                    <Route path="/service-book" element={<ServiceBook />} />
                    <Route path="/my-service-orders" element={<MyServiceOrders />} />
                    <Route path="/obd" element={<OBDDiagnostics />} />
                    <Route path="/presentation" element={<AppPresentation />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/mechanic-dashboard" element={<MechanicDashboard />} />
                    <Route path="/index" element={<Navigate to="/" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                  </ErrorBoundary>
                </div>
              </div>
              <BottomNav />
            </BrowserRouter>
          </TooltipProvider>
        </CartProvider>
      </I18nProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
