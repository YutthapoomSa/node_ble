const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
// const bluebird = require('bluebird');
const moment = require('moment-timezone');
const db = require('./db');

const thaiTimezone = 'Asia/Bangkok';

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
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();

    const formattedDate = `${year}-${month}-${day}`;

    if ((hours > 7 || (hours === 7 && minutes >= 30)) && (hours < 23 || (hours === 23 && minutes <= 59))) {
        return formattedDate;
    } else {
        // If the time is between 00:00 and 07:39, subtract one day.
        const yesterday = new Date(currentDate);
        yesterday.setDate(currentDate.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterday.getDate()).padStart(2, '0');

        return `${yYear}-${yMonth}-${yDay}`;
    }
}

async function getRoundAndDistanceFromDate(db, tag_id, start_date = null, end_date = null) {
    let round = 0;
    if (start_date && end_date) {

        if (tag_id.startsWith("0c")) {
            let round_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` >= ? and `work_date` <= ? and `tag_id` = ? and end_date is not null";
            let [round_result] = await db.query(round_sql, [start_date, end_date, tag_id]);
            round = round_result.length;
        } else {
            let round_sql = "SELECT * FROM `tags_asset_round` WHERE `work_date` >= ? and `work_date` <= ? and `tag_id` = ? and location_end is not null;";
            let [round_result] = await db.query(round_sql, [start_date, end_date, tag_id]);
            round = round_result.length;
        }

        let distance_sql = "SELECT * FROM `tagposition` WHERE `work_date` >= ? and `work_date` <= ? and `tag_id` = ? and tag_round_id is not null;";
        let [distance_result] = await db.query(distance_sql, [start_date, end_date, tag_id]);
        let distance = 0;
        if (distance_result.length > 0) {
            for (let index = 0; index < distance_result.length; index++) {
                const row = distance_result[index];
                distance += row.distance;
            }
        }

        return [round, distance]
    } else {
        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        let distance_sql = "";

        if (tag_id.startsWith("0c")) {
            let round_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` = ? and `tag_id` = ? and end_date is not null and tag_round_id is not null;";
            let [round_result] = await db.query(round_sql, [cdate, tag_id]);
            console.log([cdate, tag_id])
            round = round_result.length;

            distance_sql = "SELECT t.* FROM `tagposition` t join tags_person_round p on t.tag_round_id = p.tag_round_id  WHERE t.work_date = ? and t.tag_id = ?  and p.end_date is not null;";

        } else {
            let round_sql = "SELECT * FROM `tags_asset_round` WHERE `work_date` = ? and `tag_id` = ? and location_end is not null and tag_round_id is not null;";
            let [round_result] = await db.query(round_sql, [cdate, tag_id]);
            round = round_result.length;

            distance_sql = "SELECT t.* FROM `tagposition` t join tags_asset_round p on t.tag_round_id = p.tag_round_id  WHERE t.work_date = ? and t.tag_id = ?  and p.end_date is not null;";
        }


        let [distance_result] = await db.query(distance_sql, [cdate, tag_id]);
        let distance = 0;
        if (distance_result.length > 0) {
            for (let index = 0; index < distance_result.length; index++) {
                const row = distance_result[index];
                distance += row.distance;
            }
        }

        return [round, distance]
    }
}

async function getDistanceFromRoundId(db, tag_id, tag_round_id) {
    let distance_sql = "SELECT sum(distance) as total_result FROM `tagposition` WHERE tag_id=? and tag_round_id = ?;";
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
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (includeTime) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
        return `${year}-${month}-${day}`;
    }
}

// async function checkTimeAndDate(currentDate) {
//     const hours = currentDate.getHours();
//     const minutes = currentDate.getMinutes();

//     if ((hours > 7 || (hours === 7 && minutes >= 30)) && (hours < 14 || (hours === 14 && minutes <= 0))) {
//         return "morning";
//     } else if ((hours > 14 || (hours === 14 && minutes > 0)) && (hours < 22 || (hours === 22 && minutes <= 0))) {
//         return "evening";
//     } else {
//         return "night"; // For the time range 22:01 - 07:29 or any other cases
//     }
// }
app.get('/checktime', async (req, res) => {
    try {
        const time = new Date();
        const check_time = await checkTimeAndDate(time);

        res.json(check_time);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Define a route to interact with the MySQL database
app.get('/get_person_active_tag', async (req, res) => {
    try {
        // const db = await setupMySQLConnection();
        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        const query = "SELECT * FROM `tags_active` WHERE work_date = ? AND tag_id LIKE '0c%'";
        const [rows] = await db.execute(query, [cdate]);

        const formattedRows = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let distance = await getRoundAndDistanceFromDate(db, row.tag_id)
            const formattedRow = {
                ...row,
                total_round: distance[0],
                total_distance: distance[1],
                update_at: moment(row.update_at).tz(thaiTimezone).format('YYYY-MM-DD HH:mm:ss'),
            };
            formattedRows.push(formattedRow);
        }
        res.json({ "count": formattedRows.length, "data": formattedRows });
    } catch (error) {
        res.json({ "data": [], "count": 0, "error": error.message });
    }
});

app.get('/get_assets_active_tag', async (req, res) => {
    // now date
    // fb
    try {
        // const db = await setupMySQLConnection();
        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        const query = "SELECT * FROM `tags_active` WHERE work_date = ? AND tag_id LIKE 'fb%'";
        const [rows] = await db.execute(query, [cdate]);

        const formattedRows = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let distance = await getRoundAndDistanceFromDate(db, row.tag_id)
            const formattedRow = {
                ...row,
                total_round: distance[0],
                total_distance: distance[1],
                update_at: moment(row.update_at).tz(thaiTimezone).format('YYYY-MM-DD HH:mm:ss'),
            };
            formattedRows.push(formattedRow);
        }

        res.json({ "count": formattedRows.length, "data": formattedRows });
    } catch (error) {
        res.json({ "data": [], "count": 0, "error": error.message });
    }
});

app.post('/open_person_round', async (req, res) => {
    // now date
    // tag_id, start_zone, end_zone
    // timestamp
    let { tag_id, start_zone, end_zone } = req.body;

    // const db = await setupMySQLConnection();

    if (tag_id && start_zone && end_zone) {
        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        let check_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` = ? and `tag_id` = ? and `end_date` is null; ";
        let [check_result] = await db.query(check_sql, [cdate, tag_id]);

        if (check_result.length > 0) {
            res.json({ result: false, message: 'round don\'t close' })
        } else {
            let sql = "INSERT INTO `tags_person_round`(`tag_id`, `location_start`, `location_end`, `start_date`, `work_date`, `update_at`) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 7 HOUR),?, DATE_ADD(NOW(), INTERVAL 7 HOUR))"
            const [results] = await db.query(sql, [tag_id, start_zone, end_zone, cdate]);
            console.log('Inserted tag_id:', tag_id);

            res.json({ result: true, data: results })
        }
    } else {
        res.status(400).json({ result: false })
    }


});

app.post('/close_person_round', async (req, res) => {
    // now date
    let { tag_id } = req.body;

    // const db = await setupMySQLConnection();

    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);

    let check_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` = ? and `tag_id` = ? and `end_date` is null order by tag_round_id desc;";
    let [check_result] = await db.query(check_sql, [cdate, tag_id]);

    if (check_result.length > 0) {
        let row = check_result[0];
        let sql = "UPDATE `tags_person_round` SET `end_date`=CURRENT_TIMESTAMP + INTERVAL 7 HOUR,`update_at`=CURRENT_TIMESTAMP + INTERVAL 7 HOUR WHERE `tag_round_id`=?"
        let [result] = await db.query(sql, [row.tag_round_id]);
        res.json({ result: true, data: result })
    } else {
        res.json({ result: false, message: 'don\'t have round' })
    }
});


app.get('/list_round_person_active_tag', async (req, res) => {
    // now date
    // tag_id

    let { tag_id, start_date, end_date } = req.query;
    console.log('list_round_person_active_tag', tag_id)
    // const db = await setupMySQLConnection();

    var check_result = [];
    const formattedRows = [];

    if (start_date && end_date) {
        let check_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` >= ? and `work_date` <= ? and `tag_id` = ? and end_date is not null;";
        var [check_result] = await db.query(check_sql, [start_date, end_date, tag_id]);

        for (let i = 0; i < check_result.length; i++) {
            const row = check_result[i];
            let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
            const formattedRow = {
                ...row,
                start_date: await formatDate(row.start_date, true),
                end_date: await formatDate(row.end_date, true),
                work_date: await formatDate(row.work_date),
                // total_round: distance[0],
                total_distance: distance
            };
            formattedRows.push(formattedRow);
        }
    } else {

        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        let check_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` = ? and `tag_id` = ? and end_date is not null;";
        var [check_result] = await db.query(check_sql, [cdate, tag_id]);

        for (let i = 0; i < check_result.length; i++) {
            const row = check_result[i];
            let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
            const formattedRow = {
                ...row,
                start_date: await formatDate(row.start_date, true),
                end_date: await formatDate(row.end_date, true),
                work_date: await formatDate(row.work_date),
                // total_round: distance[0],
                total_distance: distance
            };
            formattedRows.push(formattedRow);
        }
    }

    res.json({ data: formattedRows })
});

app.get('/list_round_assets_active_tag', async (req, res) => {
    let { tag_id, start_date, end_date } = req.query;
    console.log('list_round_assets_active_tag', tag_id, start_date, end_date)

    // const db = await setupMySQLConnection();

    var check_result = [];
    const formattedRows = [];

    if (start_date && end_date) {
        let check_sql = "SELECT * FROM `tags_asset_round` WHERE `work_date` >= ? and `work_date` <= ? and `tag_id` = ? and location_end is not null;";
        var [check_result] = await db.query(check_sql, [start_date, end_date, tag_id]);

        for (let i = 0; i < check_result.length; i++) {
            const row = check_result[i];
            let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
            const formattedRow = {
                ...row,
                // total_round: distance[0],
                start_date: await formatDate(row.start_date, true),
                end_date: await formatDate(row.end_date, true),
                work_date: await formatDate(row.work_date),
                total_distance: distance
            };
            formattedRows.push(formattedRow);
        }
    } else {
        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        let check_sql = "SELECT * FROM `tags_asset_round` WHERE `work_date` = ? and `tag_id` = ? and location_end is not null;";
        var [check_result] = await db.query(check_sql, [cdate, tag_id]);

        for (let i = 0; i < check_result.length; i++) {
            const row = check_result[i];
            let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
            const formattedRow = {
                ...row,
                // total_round: distance[0],
                start_date: await formatDate(row.start_date, true),
                end_date: await formatDate(row.end_date, true),
                work_date: await formatDate(row.work_date),
                total_distance: distance
            };
            formattedRows.push(formattedRow);
        }
    }

    res.json({ data: formattedRows })
});

app.get('/search_round', async (req, res) => {
    // now date
    // tag_id

    let { tag_id, start_date, end_date } = req.query;
    console.log('list_round_person_active_tag', tag_id)
    // const db = await setupMySQLConnection();

    var check_result = [];
    const formattedRows = [];

    let table = 'tags_person_round';
    if (tag_id.startsWith("fb")) {
        table = 'tags_asset_round';
    }

    if (start_date && end_date) {
        let check_sql = "SELECT * FROM " + table + " WHERE `work_date` >= ? and `work_date` <= ? and `tag_id` = ? and end_date is not null;";
        var [check_result] = await db.query(check_sql, [start_date, end_date, tag_id]);

        for (let i = 0; i < check_result.length; i++) {
            const row = check_result[i];
            let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
            const formattedRow = {
                ...row,
                // total_round: distance[0],
                start_date: await formatDate(row.start_date, true),
                end_date: await formatDate(row.end_date, true),
                work_date: await formatDate(row.work_date),
                total_distance: distance
            };
            formattedRows.push(formattedRow);
        }
    } else {

        const currentDate = new Date();
        let cdate = await getCurrentDate(currentDate);

        let check_sql = "SELECT * FROM " + table + " WHERE `work_date` = ? and `tag_id` = ? and end_date is not null;";
        var [check_result] = await db.query(check_sql, [cdate, tag_id]);

        for (let i = 0; i < check_result.length; i++) {
            const row = check_result[i];
            let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
            const formattedRow = {
                ...row,
                // total_round: distance[0],
                start_date: await formatDate(row.start_date, true),
                end_date: await formatDate(row.end_date, true),
                work_date: await formatDate(row.work_date),
                total_distance: distance
            };
            formattedRows.push(formattedRow);
        }
    }

    res.json({ data: formattedRows })
});


app.get('/list_person_not_close', async (req, res) => {
    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);

    let check_sql = "SELECT tag_id FROM `tags_person_round` WHERE `work_date` = ? and end_date is null group by tag_id;";
    var [check_result] = await db.query(check_sql, [cdate]);

    const formattedRows = [];
    for (let i = 0; i < check_result.length; i++) {
        const row = check_result[i];
        let distance = await getDistanceFromRoundId(db, row.tag_id, row.tag_round_id)
        const formattedRow = {
            ...row,
            // total_round: distance[0],
            start_date: await formatDate(row.start_date, true),
            end_date: await formatDate(row.end_date, true),
            work_date: await formatDate(row.work_date)
        };
        formattedRows.push(formattedRow);
    }

    res.json({ data: check_result });
})


app.get('/list_round_detail_active_tag', async (req, res) => {
    let { tag_round_id, tag_id } = req.query;

    // const db = await setupMySQLConnection();

    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);

    let check_sql = "SELECT * FROM `tagposition` WHERE `tag_round_id` = ? and tag_id = ?;";
    let [check_result] = await db.query(check_sql, [tag_round_id, tag_id]);

    if (check_result.length > 0) {
        // Remove the first element from the array
        // check_result.shift();
    }

    res.json({ data: check_result });
});

function removeDuplicates(arr) {
    let unique = arr.reduce(function (acc, curr) {
        if (!acc.includes(curr))
            acc.push(curr);
        return acc;
    }, []);
    return unique;
}

app.get('/list_time_person_active_tag', async (req, res) => {
    // now date
    // active ณ ศูนย์แปล1
    // 07.30-14.00, 14.01-22.00, 22.01-07.29
    // const db = await setupMySQLConnection();

    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);
    // let zone = 'ศูนย์เปล 1';

    let sql = "SELECT * FROM `tags_person_shift_work` WHERE `tag_id` like('0c%') and work_date = ?";
    const [results] = await db.execute(sql, [cdate]);

    let works = {
        "morning": [],
        "evening": [],
        "night": []
    }

    let all_data = [];
    let tags = [];
    let work_date = {};
    for (let index = 0; index < results.length; index++) {
        const row = results[index];
        if (row.morning) {
            works.morning.push(row.tag_id)
        }
        if (row.evening) {
            works.evening.push(row.tag_id)
        }
        if (row.night) {
            works.night.push(row.tag_id)
        }

        work_date[row.tag_id] = row.work_date;
        tags.push(row.tag_id)

    }

    tags = removeDuplicates(tags);

    for (let index = 0; index < tags.length; index++) {
        const tag_id = tags[index];
        let distance = await getRoundAndDistanceFromDate(db, tag_id)
        all_data.push({
            tag_id: tag_id,
            total_round: distance[0],
            total_distance: distance[1],
            work_date: await formatDate(work_date[tag_id])
        });
    }

    res.json({ 'works_shift': works, all_data: all_data })

});

app.get('/update_shift_work', async (req, res) => {
    try {
        let { tag_id, work_date, shift_work } = req.query;
        console.log("Request Parameters:", { tag_id, work_date });

        if (shift_work === 'morning' || shift_work === 'evening' || shift_work === 'night') {
            let sql = `UPDATE tags_person_shift_work SET \`${shift_work}\` = 0 WHERE \`tag_id\` = ? AND \`work_date\` = ?`;

            const [result] = await db.query(sql, [tag_id, work_date]);
            if (result.affectedRows > 0) {
                res.status(200).json({ 'status': true, 'message': 'updated successfully' });

            } else {
                res.status(500).json({ 'status': false, 'message': 'No matching record found' });
            }
        } else {

        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ 'message': 'Internal Server Error' });
    }
});

// app.get('/list_shift_work', async (req, res) => {
//     try {
//         let { tag_id, start_date, end_date } = req.query;
//         console.log({ tag_id, start_date, end_date });

//         //ค้นหา workdate เมื่อส่งค่า start_date, end_date
//         start_date = new Date(start_date).toISOString().slice(0, 10);
//         end_date = new Date(end_date).toISOString().slice(0, 10);

//         // Query the database for shift work within the specified date range and tag_id
//         const [rows] = await db.query(`
//             SELECT *
//             FROM tags_person_shift_work
//             WHERE tag_id = ? AND work_date BETWEEN ? AND ?
//         `, [tag_id, start_date, end_date]);

//         const workDates = rows.map(row => {
//             const timeRanges = getTimeRanges(row.morning, row.evening, row.night);
//             console.log(`For work_date ${row.work_date}, time ranges are: ${JSON.stringify(timeRanges)}`);

//             return {
//                 tag_id: row.tag_id,
//                 work_date: new Date(row.work_date).toLocaleDateString('en-CA'),
//                 timeRanges: timeRanges
//             };
//         });

//         res.json(workDates);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Internal Server Error');
//     }
// });

app.get('/list_shift_work', async (req, res) => {
    try {
        let { tag_id, start_date, end_date } = req.query;
        console.log({ tag_id, start_date, end_date });

        // ค้นหา workdate เมื่อส่งค่า start_date, end_date
        start_date = new Date(start_date).toISOString().slice(0, 19).replace("T", " ");
        end_date = new Date(end_date).toISOString().slice(0, 19).replace("T", " ");

        // Query the database for shift work within the specified date range and tag_id
        const [shiftRows] = await db.query(`
            SELECT *
            FROM tags_person_shift_work
            WHERE tag_id = ? AND work_date BETWEEN ? AND ?
        `, [tag_id, start_date, end_date]);

        const workDates = await Promise.all(shiftRows.map(async row => {
            const timeRanges = getTimeRanges(row.morning, row.evening, row.night);
            // console.log(`For work_date ${row.work_date}, time ranges are: ${JSON.stringify(timeRanges)}`);

            const roundCounts = await countRounds(tag_id, row.work_date, timeRanges);

            return {
                tag_id: row.tag_id,
                work_date: new Date(row.work_date).toLocaleDateString('en-CA'),
                timeRanges: timeRanges,
                roundCounts: roundCounts
            };
        }));

        res.json(workDates);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function countRounds(tag_id, work_date, timeRanges) {
    const morningRounds = await countRoundInTimeRange(tag_id, work_date, timeRanges.morning);
    const eveningRounds = await countRoundInTimeRange(tag_id, work_date, timeRanges.evening);
    const nightRounds = await countRoundInTimeRange(tag_id, work_date, timeRanges.night);

    return {
        morning: morningRounds,
        evening: eveningRounds,
        night: nightRounds
    };
}

async function countRoundInTimeRange(tag_id, work_date, { start, end }) {
    const [roundRows] = await db.query(`
        SELECT COUNT(*) as roundCount
        FROM tags_person_round
        WHERE tag_id = ? AND work_date = ? AND
              (
                CAST(start_date AS DATETIME) BETWEEN ? AND ? OR
                CAST(end_date AS DATETIME) BETWEEN ? AND ? OR
                (
                  CAST(start_date AS DATETIME) <= ? AND
                  CAST(end_date AS DATETIME) >= ?
                )
              )
    `, [tag_id, work_date, start, end, start, end, start, end]);

    return roundRows[0].roundCount;
}

function getTimeRanges(morning, evening, night) {
    const result = {};

    if (morning === 1) {
        const morningStart = `07:30:00`;
        const morningEnd = `14:00:00`;
        result.morning = { start: morningStart, end: morningEnd };
    }

    if (evening === 1) {
        const eveningStart = `14:01:00`;
        const eveningEnd = `22:00:00`;
        result.evening = { start: eveningStart, end: eveningEnd };
    }

    if (night === 1) {
        const nightStart = `22:01:00`;
        const nightEnd = `07:29:59`;
        result.night = { start: nightStart, end: nightEnd };
    }

    console.log(`morning: ${morning}, evening: ${evening}, night: ${night}, result: ${JSON.stringify(result)}`);

    return result;
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});