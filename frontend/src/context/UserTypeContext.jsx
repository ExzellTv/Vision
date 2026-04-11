import { createContext, useContext, useState, useEffect } from "react";

/**
 * User Type Context
 * Stores whether the user is a "homeowner" or "builder"
 * This affects what features/controls are available throughout the app
 */

const UserTypeContext = createContext(null);

export function UserTypeProvider({ children }) {
  const [userType, setUserType] = useState(() => {
    // Check localStorage for persisted user type
    const saved = localStorage.getItem("vision_user_type");
    return saved || null; // null means not yet selected
  });

  // Persist to localStorage when changed
  useEffect(() => {
    if (userType) {
      localStorage.setItem("vision_user_type", userType);
    }
  }, [userType]);

  const isHomeowner = userType === "homeowner";
  const isBuilder = userType === "builder";

  const setHomeowner = () => setUserType("homeowner");
  const setBuilder = () => setUserType("builder");
  const clearUserType = () => {
    setUserType(null);
    localStorage.removeItem("vision_user_type");
  };

  return (
    <UserTypeContext.Provider
      value={{
        userType,
        isHomeowner,
        isBuilder,
        setUserType,
        setHomeowner,
        setBuilder,
        clearUserType,
      }}
    >
      {children}
    </UserTypeContext.Provider>
  );
}

export function useUserType() {
  const context = useContext(UserTypeContext);
  if (!context) {
    throw new Error("useUserType must be used within a UserTypeProvider");
  }
  return context;
}

export default UserTypeContext;
