import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  Navigate
} from "react-router-dom";


import { LandingPage } from "./components/landing/LandingPage";
import { LoginPage } from "./components/auth/LoginPage";
import { RegisterPage } from "./components/auth/RegisterPage";
import { UserDashboard } from "./components/dashboard/UserDashboard";
import { AdminDashboard } from "./components/admin/AdminDashboard";

import { useAuth } from "../context/AuthContext";


export type Page =
  | "landing"
  | "login"
  | "register"
  | "dashboard"
  | "admin";



function ProtectedRoute({
  children
}: {
  children: React.ReactNode
}) {


  const {
    user,
    loading
  } = useAuth();


  if (loading) {

    return (
      <div>
        Loading...
      </div>
    );

  }


  if (!user) {

    return (
      <Navigate
        to="/login"
        replace
      />
    );

  }


  return children;


}



function AppRoutes() {


  const {
    user,
    loading
  } = useAuth();


  const routerNavigate =
    useNavigate();


  const navigate = (
    page: Page
  ) => {


    const paths = {

      landing: "/",

      login: "/login",

      register: "/register",

      dashboard: "/dashboard",

      admin: "/admin"

    };


    routerNavigate(
      paths[page]
    );

  };


  if (loading) {

    return (
      <div>
        Loading...
      </div>
    );

  }


  return (

    <Routes>


      <Route
        path="/"
        element={
          <LandingPage navigate={navigate} />
        }
      />


      <Route
        path="/login"
        element={
          <LoginPage navigate={navigate} />
        }
      />


      <Route
        path="/register"
        element={
          <RegisterPage navigate={navigate} />
        }
      />


      <Route
        path="/dashboard"
        element={

          <ProtectedRoute>

            <UserDashboard navigate={navigate} />

          </ProtectedRoute>

        }
      />


      <Route
        path="/admin"
        element={

          user?.role === "ADMIN"

            ?

            <AdminDashboard navigate={navigate} />

            :

            <Navigate
              to="/dashboard"
              replace
            />

        }
      />


    </Routes>

  );

}



export default function App() {


  return (

    <BrowserRouter>

      <AppRoutes />

    </BrowserRouter>

  );

}