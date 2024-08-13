import mongoose, { Schema } from "mongoose";

const offerSchema = new Schema({
    name: {
        type: String,
        required: [true,'name is required'],
    },
    description: {
        type: String,
        required: [true,'description is required'],
    },
    discount: {
        type: Number,
        required: [true,'discount is required'],
    },
    startDate: {
        type: Date,
        required: [true,'start date is required'],
    },
    endDate: {
        type: Date,
        required: [true,'end date is required'],
    },
    restaurant: {
        type: Schema.Types.ObjectId,
        ref: "Restaurant",
    },
});

interface IOffer extends Document {
    name: string;
    description: string;
    discount: number;
    startDate: Date;
    endDate: Date;
    restaurant: mongoose.Types.ObjectId;
}

const Offer = mongoose.model<IOffer>("Offer", offerSchema);
export default Offer