import { EmbedBuilder } from "discord.js";
const e = new EmbedBuilder().setTitle("t").setDescription("d").addFields({ name: "x", value: "y" });
console.log("BUILT", e.toJSON().fields?.length);
