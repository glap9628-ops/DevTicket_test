package com.innotium.devticket.common.auth;

public class UserContextHolder {

    private static final ThreadLocal<CurrentUser> holder = new ThreadLocal<>();

    public static void set(CurrentUser user) {
        holder.set(user);
    }

    public static CurrentUser get() {
        return holder.get();
    }

    public static void clear() {
        holder.remove();
    }
}
