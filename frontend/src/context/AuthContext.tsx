import {
    createContext,
    useContext,
    useEffect,
    useState
} from "react";

import { api } from "../services/api";


type User = {

    id: string;

    name: string;

    email: string;

    role: "USER" | "ADMIN";

    storageUsed: string;

    storageLimit: string;

};


type AuthContextType = {

    user: User | null;

    loading: boolean;

    setUser: (user: User | null) => void;

    logout: () => Promise<void>;

};


const AuthContext =
    createContext<AuthContextType | null>(
        null
    );


export const AuthProvider = ({
    children
}: {
    children: React.ReactNode
}) => {


    const [user, setUser] =
        useState<User | null>(null);


    const [loading, setLoading] =
        useState(true);



    useEffect(() => {


        const checkAuth = async () => {


            try {


                const res =
                    await api.get(
                        "/auth/me"
                    );


                setUser(
                    res.data.user
                );


            } catch {


                setUser(null);


            } finally {


                setLoading(false);


            }


        };


        checkAuth();


    }, []);



    const logout = async () => {


        await api.post(
            "/auth/logout"
        );


        setUser(null);


    };



    return (

        <AuthContext.Provider

            value={{
                user,
                loading,
                setUser,
                logout
            }}

        >

            {children}

        </AuthContext.Provider>

    );


};



export const useAuth = () => {


    const context =
        useContext(
            AuthContext
        );


    if (!context) {

        throw new Error(
            "useAuth must be inside AuthProvider"
        );

    }


    return context;


};