import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/layout/DesktopSidebar";
import Landing from "./pages/Landing";
import Shop from "./pages/Shop";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Service from "./pages/Service";
import Vehicles from "./pages/Vehicles";
import VehicleDetail from "./pages/VehicleDetail";
import Account from "./pages/Account";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Contact from "./pages/Contact";
import ResetPassword from "./pages/ResetPassword";
import MyOrders from "./pages/MyOrders";
import MyVehicles from "./pages/MyVehicles";
import Notifications from "./pages/Notifications";
import AiMechanic from "./pages/AiMechanic";
import Terms from "./pages/Terms";
import Emergency from "./pages/Emergency";
import ServicePlan from "./pages/ServicePlan";
import ServiceBook from "./pages/ServiceBook";
import MyServiceOrders from "./pages/MyServiceOrders";
import AppPresentation from "./pages/AppPresentation";
import VehicleOffer from "./pages/VehicleOffer";
import EPC from "./pages/EPC";
import MechanicDashboard from "./pages/MechanicDashboard";
import OBDDiagnostics from "./pages/OBDDiagnostics";
import Garage from "./pages/Garage";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnboardingGuide from "@/components/OnboardingGuide";
import { I18nProvider } from "@/contexts/I18nContext";

const queryClient = new QueryClient();

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
