const express = require("express");
const axios = require("axios");
const mysql = require("mysql2/promise");
// const bluebird = require('bluebird');
const moment = require("moment-timezone");
const db = require("./db");

const thaiTimezone = "Asia/Bangkok";

const app = express();
const port = 3202;

app.use(express.json());
app.use(
    express.urlencoded({
        extended: true,
    })
);

async function getCurrentDate(currentDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();

    const formattedDate = `${year}-${month}-${day}`;

    if (
        (hours > 7 || (hours === 7 && minutes >= 30)) &&
        (hours < 23 || (hours === 23 && minutes <= 59))
    ) {
        return formattedDate;
    } else {
        // If the time is between 00:00 and 07:39, subtract one day.
        const yesterday = new Date(currentDate);
        yesterday.setDate(currentDate.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
        const yDay = String(yesterday.getDate()).padStart(2, "0");

        return `${yYear}-${yMonth}-${yDay}`;
    }
}
async function getDistanceFromTRID(db, tag_id, tag_round_id) {
    try {
        if (tag_id.startsWith("0c")) {
            // Query for distance within the specified tag_round_id
            const distance_sql = "SELECT tag_id, before_zone, after_zone, tag_round_id, distance, work_date FROM `tagposition` WHERE `tag_round_id` = ?";

            const [distance_result] = await db.query(distance_sql, [tag_round_id]);
            const result = await getDistanceFromRoundId(db, tag_id, tag_round_id)

            // Return the distances
            return [distance_result, result];
        } else {
            return [];
        }
    } catch (error) {
        console.error(error);
        throw new Error("Error fetching distance data");
    }
}

async function getDistanceFromRoundId(db, tag_id, tag_round_id) {
    let distance_sql =
        "SELECT sum(distance) as total_result FROM `tagposition` WHERE tag_id=? and tag_round_id = ?;";
    let [distance_result] = await db.query(distance_sql, [tag_id, tag_round_id]);
    if (distance_result.length > 0) {
        return distance_result[0].total_result;
    } else {
        return 0;
    }
}

async function formatDate(inputDate, includeTime) {
    const date = new Date(inputDate);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    if (includeTime) {
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
        return `${year}-${month}-${day}`;
    }
}

app.get("/list_shift_work", async (req, res) => {
    try {
        let { start_date, end_date } = req.query;

        console.log({ start_date, end_date });
        // Query the database for shift work within the specified date range and tag_id
        const [shiftRows] = await db.query(
            `
            SELECT *
            FROM tags_person_shift_work
            WHERE work_date BETWEEN ? AND ?
        `,
            [start_date, end_date]
        );

        let shift_date = {};

        for (let index = 0; index < shiftRows.length; index++) {
            const shift = shiftRows[index];
            const formattedDate = await formatDate(shift.work_date);

            if (!shift_date[formattedDate]) {
                shift_date[formattedDate] = {
                    work_date: formattedDate,
                    morning: [],
                    evening: [],
                    night: [],
                };
            }

            const tag_id = shift.tag_id;
            const isMorning = shift.morning === 1 && tag_id.startsWith("0c");
            const isEvening = shift.evening === 1 && tag_id.startsWith("0c");
            const isNight = shift.night === 1 && tag_id.startsWith("0c");

            // console.log(tag_id, isMorning, isEvening, isNight);

            // const [round, distance] = await getRoundAndDistanceFromDate(db, tag_id, start_date, end_date);

            if (isMorning) {
                let shiftObject = {
                    tag_id,
                    round: []
                };
                shiftObject.round = await getShiftRound(db, tag_id, formattedDate, 'morning');
                shift_date[formattedDate].morning.push(shiftObject);

                // Calculate distance for each round
                const distancePromises = shiftObject.round.map(async (round) => {
                    const distance = await calculateDistance(db, tag_id, round.tag_round_id);
                    return { ...round, distance };
                });

                // Wait for all distance calculations to complete
                const roundDataWithDistance = await Promise.all(distancePromises);

                // Replace the original round data with the one including distance
                shiftObject.round = roundDataWithDistance;
            }

            if (isEvening) {
                let shiftObject = {
                    tag_id,
                    round: []
                };
                shiftObject.round = await getShiftRound(db, tag_id, formattedDate, 'evening')
                shift_date[formattedDate].evening.push(shiftObject);
            }

            if (isNight) {
                let shiftObject = {
                    tag_id,
                    round: []
                };
                shiftObject.round = await getShiftRound(db, tag_id, formattedDate, 'night')
                shift_date[formattedDate].night.push(shiftObject);
            }
        }



        res.json(shift_date);
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});


app.get("/test", async (req, res) => {
    try {
        const tag_id = "0c1152000409";
        const work_date = "2023-10-17";
        const round_type = "evening";

        // Get round data
        const roundData = await getShiftRound(db, tag_id, work_date, round_type);

        // Calculate distance for each round
        const distancePromises = roundData.map(async (round) => {
            const distance = await calculateDistance(db, tag_id, round.tag_round_id);
            return { ...round, distance };
        });

        // Wait for all distance calculations to complete
        const roundDataWithDistance = await Promise.all(distancePromises);

        console.log(roundDataWithDistance);
        res.json(roundDataWithDistance);
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

async function getShiftRound(db, tag_id, work_date, round_type) {
    try {
        // Query to get shift rounds for the specified tag_id and work_date
        const [roundRows] = await db.query(
            `
            select * from (SELECT
                tag_id,tag_round_id ,start_date , end_date,
                DATE_FORMAT(work_date, '%Y-%m-%d') as work_date,
                CASE
                WHEN time(start_date) >= '07:30:00' AND time(start_date) <= '14:00:00' THEN 'morning'
                WHEN time(start_date) >= '14:00:01' AND time(start_date) <= '22:00:00' THEN 'evening'
                ELSE 'night'
            END AS round_type
            FROM
                tags_person_round
            WHERE
                tag_id = ? AND DATE_FORMAT(work_date, '%Y-%m-%d') = ? and start_date IS NOT NULL) a where round_type= ?;
            `,
            [tag_id, await formatDate(work_date), round_type]
        );

        // console.log(roundRows)

        // Return the result
        return roundRows;
    } catch (error) {
        console.error(error);
        throw new Error("Error fetching shift round data");
    }
}

async function calculateDistance(db, tag_id, tag_round_id) {
    try {
        // Query to get distance for the specified tag_id and tag_round_id
        const [distanceRows] = await db.query(
            `
            SELECT *
            FROM tagposition
            WHERE tag_id = ? AND tag_round_id = ?
            `,
            [tag_id, tag_round_id]
        );

        // Calculate total distance
        const totalDistance = distanceRows.reduce((acc, row) => acc + row.distance, 0);

        return totalDistance;
    } catch (error) {
        console.error(error);
        throw new Error("Error calculating distance");
    }
}




app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
