import { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import Category from "../models/category";
import Order from "../models/order";
import Restaurant from "../models/restaurantModal";
import Product from "../models/productModel";
import User from "../models/userModel";
import ApiErrorHandler from "../utils/apiErrorHandler";
import mongoose from "mongoose";
import { getYearRange } from "../utils";
import customers from "razorpay/dist/types/customers";

export const addCategory = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name } = req.body;

    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      return next(new ApiErrorHandler("Category already exists", 400));
    }

    let imageName = "";
    if (req.file) {
      imageName = req.file.filename;
    }
    const image =
      req.protocol + "://" + req.get("host") + "/images/" + imageName;

    const category = await Category.create({ name, image });
    res.status(201).json({ category });
  }
);

export const deleteCategory = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "category deleted" });
  }
);

export const adminDashboardStats = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if(!req.costumeUser) return next(new ApiErrorHandler("Unauthorized", 401))
    const year = req.query.year;
    const totalOrders = await Order.countDocuments();
    const totalRestaurants = await Restaurant.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalRiders = await User.countDocuments({ role: "rider" });
    const monthlyRevenue = Array(12).fill(0);

    // get recent orders
    const recentOrders = await Order.find()
      .sort({ _id: -1 })
      .limit(10)
      .populate({ path: "user", select: "name email image phone location personalDetails.address personalDetails.phone" })
      .populate({ path: "restaurant", select: "name image address location" });

    const allOrders = await Order.find({ orderStatus: "Delivered" }).populate({
      path: "user",
      select: "name email image phone location",
    });
    let totalRevenue = 0;
    allOrders.forEach((order) => {
      totalRevenue += order.totalPrice;
    });

    res.status(200).json({
      totalRiders,
      totalRestaurants,
      totalCategories,
      totalProducts,
      recentOrders,
      totalOrders,
      totalRevenue,
      monthlyRevenue,
      user: req.costumeUser.name
    });
  }
);


export const getYearsComparisonAdmin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const year1 = new Date().getFullYear();
    const year2 = year1 - 1;

    async function getOrdersForYear(year: number) {
      const { start, end } = getYearRange(year);
      return Order.find({
        orderStatus: "Delivered",
        deliveredAt: {
          $gte: start,
          $lt: end,
        },
      });
    }
    const firstYear = Array(12).fill(0);
    const secondYear = Array(12).fill(0);
    const monthsInYear = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const ordersYear1 = await getOrdersForYear(year1);
    const ordersYear2 = await getOrdersForYear(year2);

    ordersYear1.forEach((order) => {
      const month = new Date(order.deliveredAt!).getMonth();
      firstYear[month] += order.totalPrice;
    });

    ordersYear2.forEach((order) => {
      const month = new Date(order.deliveredAt!).getMonth();
      secondYear[month] += order.totalPrice;
    });

    const graphData = monthsInYear.map((month, index) => ({
      month: `${month}`, // Label for each day
      currentYear: firstYear[index], // Corresponding order co
      previousYear: secondYear[index],
    }));

    res.status(200).json({
      message: "data retrieved successfully",
      graphData,
    });
  }
);

export const getOrderMapDataAdmin = asyncHandler(
  async (req: Request, res: Response, next: Function) => {


    // ========================current week============================================
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Get the start of the week (Sunday)

    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (6 - today.getDay())); // Get the end of the week (Saturday)

    const weeklyOrderCount = Array(7).fill(0); // For each day of the week
    const daysOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const weeklyOrders = await Order.find({
      orderStatus: "Delivered",
      deliveredAt: {
        $gte: startOfWeek,
        $lt: endOfWeek,
      },
    });
    weeklyOrders.forEach((order) => {
      const deliveredAt = new Date(order.deliveredAt!);
      const dayOfWeek = deliveredAt.getDay(); // Get the day of the week (0 for Sunday, 1 for Monday, etc.)
      weeklyOrderCount[dayOfWeek] += 1;
    });

    const weeklyOrderData = daysOfWeek.map((day, index) => ({
      day,
      count: weeklyOrderCount[index],
    }));

    // ============================================last 30 days============================================

    const endOfMonth = new Date();
    const startOfMonth = new Date();
    startOfMonth.setDate(endOfMonth.getDate() - 30); // 30 days ago

    const monthlyOrderCount = Array(30).fill(0); // For each day of the last 30 days
    const daysInMonth = Array.from({ length: 30 }, (_, index) => index + 1);

    const monthlyOrders = await Order.find({
      orderStatus: "Delivered",
      deliveredAt: {
        $gte: startOfMonth,
        $lt: endOfMonth,
      },
    });

    monthlyOrders.forEach((order) => {
      const deliveredAt = new Date(order.deliveredAt!);
      const dayOfMonth = Math.floor(
        (deliveredAt.getTime() - startOfMonth.getTime()) / (24 * 60 * 60 * 1000)
      ); // Day index in the last 30 days
      monthlyOrderCount[dayOfMonth] += 1;
    });

    const monthlyOrderData = daysInMonth.map((day, index) => ({
      day: `${day}`, // Label for each day
      count: monthlyOrderCount[index], // Corresponding order co
    }));

    // =======================================last 24 hours============================================

    const endOfDay = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(startOfDay.getHours() - 24); // 24 hours ago

    const hourlyOrderCount = Array(24).fill(0); // For each hour of the day
    const hoursInDay = Array.from({ length: 24 }, (_, index) => index + 1);

    const hourlyOrders = await Order.find({
      orderStatus: "Delivered",
      deliveredAt: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    hourlyOrders.forEach((order) => {
      const deliveredAt = new Date(order.deliveredAt!);
      const hourOfDay = deliveredAt.getHours(); // Get the hour of the day (0-23)
      hourlyOrderCount[hourOfDay] += 1;
    });

    const hourlyOrderData = hoursInDay.map((day, index) => ({
      day: `${day}`, // Label for each day
      count: hourlyOrderCount[index], // Corresponding order co
    }));

    res.status(200).json({
      success: true,
      message: "monthly , weekly, daily order count  retrieved successfully",
      monthlyOrderData,
      weeklyOrderData,
      hourlyOrderData,
    });
  }
);


export const ordersListAndHistory = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const timeQuery = req.query.time;
    const sort = req.query.sort as string;
    const search = req.query.search as string;

    let orders = await Order.find()
      .sort({
        createdAt: sort === "asc" ? 1 : -1,
      })
      .populate({
        path: "restaurant",
        select: "name image",
      })
      .populate({
        path: "user",
        select:
          "name email image personalDetails.phone personalDetails.address",
      })
      .populate({
        path: "orderItem.product",
        select: "itemName description",
      });

    

    if (!orders) {
      return next(new ApiErrorHandler("orders not found", 404));
    }

    if (search) {
      orders = orders.filter((order) => {
        const user = order.user as any;
        return user?.name.toLowerCase().includes(search.toLowerCase());
      });
    }

    // current week order ================================
    if (timeQuery === "weekly") {
      const endOfWeek = new Date();
      const startOfWeek = new Date();
      startOfWeek.setDate(endOfWeek.getDate() - 7); // 30 days ago

      let weeklyOrders = await Order.find({
        createdAt: {
          $gte: startOfWeek,
          $lt: endOfWeek,
        },
      })
        .populate({
          path: "restaurant",
          select: "name image",
        })
        .populate({
          path: "user",
          select:
            "name email image personalDetails.phone personalDetails.address",
        })
        .populate({
          path: "orderItem.product",
          select: "itemName description",
        });

      if (search) {
        weeklyOrders = weeklyOrders.filter((order) => {
          const user = order.user as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }

      res.status(200).json({
        success: true,
        orders: weeklyOrders,
      });
    }
    // current month orders+++++++++++++++++++++++++++++++++++++++
    else if (timeQuery === "monthly") {
      const endOfMonth = new Date();
      const startOfMonth = new Date();
      startOfMonth.setDate(endOfMonth.getDate() - 30); // 30 days ago

      let monthlyOrders = await Order.find({
        createdAt: {
          $gte: startOfMonth,
          $lt: endOfMonth,
        },
      })
        .populate({
          path: "restaurant",
          select: "name image address phone location",
        })
        .populate({
          path: "user",
          select:
            "name email image personalDetails.phone personalDetails.address",
        })
        .populate({
          path: "orderItem.product",
          select: "itemName description",
        });
      if (search) {
        monthlyOrders = monthlyOrders.filter((order) => {
          const user = order.user as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }
      res.status(200).json({
        success: true,
        orders: monthlyOrders,
      });
    }

    // todays orders+++++++++++++++++++++++
    else if (timeQuery === "daily") {
      const endOfDay = new Date();
      const startOfDay = new Date();
      startOfDay.setHours(startOfDay.getHours() - 24); // 24 hours ago

      let hourlyOrders = await Order.find({
        createdAt: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      })
        .populate({
          path: "restaurant",
          select: "name image",
        })
        .populate({
          path: "user",
          select:
            "name email image personalDetails.phone personalDetails.address",
        })
        .populate({
          path: "orderItem.product",
          select: "itemName description",
        });

      if (search) {
        hourlyOrders = hourlyOrders.filter((order) => {
          const user = order.user as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }
      res.status(200).json({
        success: true,
        orders: hourlyOrders,
      });
    } else {
      res.status(200).json({
        orders,
        success: true,
      });
    }
  }
);

export const getCustomers = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {

    const timeQuery = req.query.time;
    const sort = req.query.sort as string;
    const search = req.query.search as string;

    let customersWithOrders = await User.find({
      // role: "customer",
      orders: { $exists: true, $not: { $size: 0 } },
    }).select(
      "-password -OTP -OTPExpire  -identification -accountBalance -isApproved -vehicleDetails -ratings -reviews -totalReview"
    ).sort({
        createdAt: sort === "asc" ? 1 : -1,
      });
      if (search) {
        customersWithOrders  = customersWithOrders.filter((customer) => {
          const user = customer as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }

        // current week order ================================
    if (timeQuery === "weekly") {
      const endOfWeek = new Date();
      const startOfWeek = new Date();
      startOfWeek.setDate(endOfWeek.getDate() - 7); // 30 days ago

      let weeklyCustomers = await User.find({
        orders: { $exists: true, $not: { $size: 0 } },
        createdAt: {
          $gte: startOfWeek,
          $lt: endOfWeek,
        },
      }).select(
        "-password -OTP -OTPExpire  -identification -accountBalance -isApproved -vehicleDetails -ratings -reviews -totalReview"
      ).sort({
          createdAt: sort === "asc" ? 1 : -1,
        });

      if (search) {
        weeklyCustomers = weeklyCustomers.filter((c) => {
          const user = c as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }

      res.status(200).json({
        success: true,
        customers: weeklyCustomers,
      });
    }
    // current month orders+++++++++++++++++++++++++++++++++++++++
    else if (timeQuery === "monthly") {
      const endOfMonth = new Date();
      const startOfMonth = new Date();
      startOfMonth.setDate(endOfMonth.getDate() - 30); // 30 days ago

      let monthlyCustomers = await User.find({
        orders: { $exists: true, $not: { $size: 0 } },
        createdAt: {
          $gte: startOfMonth,
          $lt: endOfMonth,
        },
      })
      .populate('orders')
      .select(
        "-password -OTP -OTPExpire  -identification -accountBalance -isApproved -vehicleDetails -ratings -reviews -totalReview"
      ).sort({
          createdAt: sort === "asc" ? 1 : -1,
        });
      if (search) {
        monthlyCustomers = monthlyCustomers.filter((c) => {
          const user = c as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }
      res.status(200).json({
        success: true,
        customers: monthlyCustomers,
      });
    }

    // todays orders+++++++++++++++++++++++
    else if (timeQuery === "daily") {
      const endOfDay = new Date();
      const startOfDay = new Date();
      startOfDay.setHours(startOfDay.getHours() - 24); // 24 hours ago

      let hourlyCustomers = await User.find({
        orders: { $exists: true, $not: { $size: 0 } },
        createdAt: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      }) .select(
        "-password -OTP -OTPExpire  -identification -accountBalance -isApproved -vehicleDetails -ratings -reviews -totalReview"
      ).sort({
          createdAt: sort === "asc" ? 1 : -1,
        });
        

      if (search) {
        hourlyCustomers = hourlyCustomers.filter((c) => {
          const user = c as any;
          return user?.name.toLowerCase().includes(search.toLowerCase());
        });
      }
      res.status(200).json({
        success: true,
        customers: hourlyCustomers,
      });
    } else {
      res.status(200).json({
       customers: customersWithOrders,
        success: true,
      });
    }





  }
);

export const getRestaurants = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const restaurants = await Restaurant.find({ isApproved: true }).select(
      "-password -OTP -OTPExpire"
    );
    res.status(200).json({ restaurants, success: true });
  }
);

export const getPendingRestaurants = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const restaurants = await Restaurant.find({ isApproved: false }).select(
      "-password -OTP -OTPExpire"
    );
    res.status(200).json({ restaurants, success: true });
  }
);

export const getRestaurantDetails = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const restaurant = await Restaurant.findById(id).select(
      "-password -OTP -OTPExpire"
    );
    res.status(200).json({ restaurant, success: true });
  }
);

export const getRiders = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const riders = await User.find({ role: "rider", isApproved: true }).select(
      "-password -OTP -OTPExpire"
    );
    res.status(200).json({ riders, success: true });
  }
);

export const getPendingRiders = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const riders = await User.find({ role: "rider", isApproved: false }).select(
      "-password -OTP -OTPExpire"
    );
    res.status(200).json({ riders, success: true });
  }
);
export const getRiderDetails = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const rider = await User.findById(id).select("-password -OTP -OTPExpire");
    res.status(200).json({ rider, success: true });
  }
);

export const acceptRider = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { isApprove } = req.body;
    const rider = await User.findById(id);
    if (!rider) return next(new ApiErrorHandler("Rider not found", 404));
    rider.isApproved = isApprove;
    await rider.save();
    res.status(200).json({
      success: true,
      message: "Rider updated successfully",
      approve: rider?.isApproved,
    });
  }
);

export const acceptRestaurant = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { isApprove } = req.body;
    const restaurant = await Restaurant.findById(id);
    if (!restaurant)
      return next(new ApiErrorHandler("Restaurant not found", 404));
    restaurant.isApproved = isApprove;
    await restaurant.save();
    res.status(200).json({
      success: true,
      message: "Restaurant updated successfully",
      approve: restaurant?.isApproved,
    });
  }
);
