const axios = require('axios');
// const mysql = require('mysql2/promise'); // Use the promise version
const mysql = require('mysql2');

let pool;

function createPool() {
  pool = mysql.createPool({
      host: '127.0.0.1',
      user: 'root',
      password: '123132123',
      database: 'ble_tracking',
      connectionLimit: 15,
      waitForConnections: true,
      queueLimit: 0,
  });

  pool.on('error', (err) => {
      console.error('Database connection error:', err);
      createPool();
      // if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      //     // Attempt to reconnect
      //     createPool();
      // } else {
      //     throw err;
      // }
  });

  // Call the function after a successful reconnection
  pool.on('connection', (connection) => {
      console.log('Connected to database');
      getDistancePerTag();
  });
}

createPool();

const db = pool.promise();

var distance_per_tag = {};

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

async function setRound(db, tag_id){
    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);

    let check_sql = "SELECT * FROM `tags_person_round` WHERE `work_date` = ? and `tag_id` = ? and `end_date` is null order by tag_round_id desc;";
    let [check_result] = await db.query(check_sql, [cdate, tag_id]);

    if(check_result.length > 0){
      let row = check_result[0];
      return row.tag_round_id;
    }else{
        return null;
    }
}

// Function to insert a new tag into the database
async function insertTag(db, tag, zone, tag_round_id=null) {
  try {
    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);

    // console.log("active")
    let sql = "INSERT INTO `tags_active`(`tag_id`, `before_zone`, `after_zone`, `before_ts`, `after_ts`, rssiCoordinateSystemName, update_at, work_date) VALUES (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 7 HOUR),?)";
    await db.query(sql, [tag.id, null, zone, null, tag.ioStatesTS, tag.rssiCoordinateSystemName, cdate]);
    console.log('Inserted tag_id:', tag.id);

    let round_id = null;
    if (tag.id.startsWith("0c")) {
      round_id = await setRound(db, tag.id);
    }else{
      round_id = tag_round_id;
    }

    let sqlTagPosition = "INSERT INTO `tagposition`(`tag_id`, `before_zone`, `after_zone`, `before_ts`, `after_ts`, create_at, tag_round_id, work_date, distance) VALUES (?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 7 HOUR),?,?,0)";
    let tagposition_res = await db.query(sqlTagPosition, [tag.id, null, zone, null, tag.ioStatesTS, round_id, cdate]);
    // console.log('tagposition',tagposition_res)
    // console.log('Inserted tagposition tag_id:', tag.id);
  } catch (err) {
    console.error('Error inserting data into database:', err);
  }
}

// Function to update an existing tag in the database
async function updateTag(db, tag, zone, row, tag_round_id=null) {
  try {
    const currentDate = new Date();
    let cdate = await getCurrentDate(currentDate);

    // console.log("active")
    let sql = "UPDATE `tags_active` SET `before_zone`=?, `after_zone`=?, `before_ts`=?, `after_ts`=?, rssiCoordinateSystemName=?, update_at = CURRENT_TIMESTAMP + INTERVAL 7 HOUR, work_date = ? WHERE tag_id = ?";
    await db.query(sql, [row.after_zone, zone, row.after_ts, tag.ioStatesTS, tag.rssiCoordinateSystemName, cdate, tag.id]);
    // console.log('Updated tag_id:', tag.id);

    let round_id = null;
    if (tag.id.startsWith("0c")) {
      round_id = await setRound(db, tag.id);
    }else{
      round_id = tag_round_id;
    }


    let distance = 0;
    try {
      console.log([row.after_zone][zone])
      distance = distance_per_tag[row.after_zone][zone]
    } catch (error) {
      distance = 0;
      console.log(error.message)
    }

    if(distance == null){
      distance = 0;
    }

    let sqlTagPosition = "INSERT INTO `tagposition`(`tag_id`, `before_zone`, `after_zone`, `before_ts`, `after_ts`, create_at, tag_round_id, work_date,distance) VALUES (?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 7 HOUR), ?, ?, ?)";
    let tagposition_res = await db.query(sqlTagPosition, [tag.id, row.after_zone, zone, row.after_ts, tag.ioStatesTS, round_id, cdate,distance]);
    // console.log('tagposition',tagposition_res)
    // console.log('Inserted tagposition tag_id:', tag.id);
  } catch (err) {
    console.error('Error updating data in database:', err);
  }
}

async function checkTimeAndDate(currentDate) {
  const hours = currentDate.getHours();
  const minutes = currentDate.getMinutes();

  if ((hours > 7 || (hours === 7 && minutes >= 30)) && (hours < 14 || (hours === 14 && minutes <= 0))) {
    return 0;
  } else if ((hours > 14 || (hours === 14 && minutes > 0)) && (hours < 22 || (hours === 22 && minutes <= 0))) {
    return 1;
  } else {
    return 2; // For the time range 22:01 - 07:29 or any other cases
  }
}

async function setShiftWork(db, tag, zone) {
  const currentDate = new Date();
  let cdate = await getCurrentDate(currentDate);
  let shift_date = await checkTimeAndDate(currentDate)

  // console.log(shift_date)

  const tag_id = tag.id;
  
  if(zone == 'ศูนย์เปล 1'){
    const [results] = await db.execute('SELECT * FROM tags_person_shift_work WHERE tag_id = ? and work_date = ?', [tag_id, cdate]);
    if (results.length === 0) {
      let shift_time = [0,0,0];
      shift_time[shift_date] = 1;
      let sql = "INSERT INTO `tags_person_shift_work`(`tag_id`, `work_date`, `morning`, `evening`, `night`) VALUES (?,?,?,?,?)"
      const [insert_results] = await db.execute(sql, [tag_id, cdate,shift_time[0],shift_time[1],shift_time[2]]);
      // console.log(insert_results.info)
    }else{
      let row = results[0];
      let shift_time = [row.morning, row.evening, row.night];
      shift_time[shift_date] = 1;
      let sql = "UPDATE `tags_person_shift_work` SET `work_date`= ?,`morning`= ?,`evening`= ?,`night`= ?,`update_at`= CURRENT_TIMESTAMP + INTERVAL 7 HOUR WHERE `shift_id` = ?";
      const [update_results] = await db.execute(sql, [cdate,shift_time[0],shift_time[1],shift_time[2],row.shift_id]);
      // console.log(update_results.info)
    }
  }
}

async function setAssetsRound(db, tag, zone){
  const currentDate = new Date();
  let cdate = await getCurrentDate(currentDate);
  const tag_id = tag.id;
  let check_sql = "SELECT * FROM `tags_asset_round` WHERE `end_date` is null and `tag_id` = ? and `work_date` = ? limit 1;";
  const [check_result] = await db.execute(check_sql, [tag_id, cdate]);
  if(zone == 'ศูนย์เปล 1'){
    if(check_result.length > 0){
      let row = check_result[0];
      let sql_update = "UPDATE `tags_asset_round` SET `location_end`=?,`end_date`= CURRENT_TIMESTAMP + INTERVAL 7 HOUR,`update_at`= CURRENT_TIMESTAMP + INTERVAL 7 HOUR WHERE tag_round_id = ?";
      const [update_results] = await db.execute(sql_update, [zone, row.tag_round_id]);
      console.log('tag_round_id', row.tag_round_id)

      return row.tag_round_id;
    }else{
      let sql_insert = "INSERT INTO `tags_asset_round`(`tag_id`, `location_start`, `start_date`, `update_at`, `work_date`) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 HOUR),DATE_ADD(NOW(), INTERVAL 7 HOUR),?)"
      const [insert_results] = await db.execute(sql_insert, [tag_id, zone, cdate]);
      console.log('tag_round_id', insert_results.insertId)
      return insert_results.insertId;
    }
  }else{
    if(check_result.length > 0){
      let row = check_result[0];
      return row.tag_round_id;
    }else{
      let sql_insert = "INSERT INTO `tags_asset_round`(`tag_id`, `location_start`, `start_date`, `update_at`, `work_date`) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 HOUR),DATE_ADD(NOW(), INTERVAL 7 HOUR),?)"
      const [insert_results] = await db.execute(sql_insert, [tag_id, zone, cdate]);
      return insert_results.insertId;
    }
  }
}

// Function to fetch data from the external API and process it
async function fetchData() {
  try {
    // const db = await setupMySQLConnection();

    const config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: 'http://192.168.81.235:8080/qpe/getTagInfo?version=2&maxAge=5000',
      headers: {},
    };

    const response = await axios.request(config);
    const tags = response.data.tags;

    // console.log(tags)

    for (let index = 0; index < tags.length; index++) {
      const tag = tags[index];
      const tag_id = tag.id;
      console.log(tag_id)

      // Check if tag_id exists in the database
      const [results] = await db.execute('SELECT * FROM tags_active WHERE tag_id = ?', [tag_id]);

      let zone = null;
      if (Array.isArray(tag.zones) && tag.zones.length > 0) {
        zone = tag.zones[0].name;
        zone['rssiCoordinateSystemName'] = tag['rssiCoordinateSystemName'];
      }

      await setShiftWork(db, tag, zone)

      // console.log(results)

      let tag_round_id = null;
      if (results.length === 0) {
        if (tag.id.startsWith("fb")) {
          tag_round_id = await setAssetsRound(db, tag, zone)
        }
        await insertTag(db, tag, zone, tag_round_id);
      } else {
        // Update the tag if it already exists (you can add your update logic here)
        let row = results[0];
        // console.log(row.after_zone !== zone && zone !== null)
        if (row.after_zone !== zone && zone !== null) {
          if (tag.id.startsWith("fb")) {
            tag_round_id = await setAssetsRound(db, tag, zone)
          }
          await updateTag(db, tag, zone, row, tag_round_id);
        }
      }
    }

    // Close the database connection when done
    // await db.end();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

async function getDistancePerTag() {
  try {
    // Setup MySQL connection and query
    // const db = await setupMySQLConnection();
    const [results] = await db.execute('SELECT * FROM distance_tag', []);

    if (results.length > 0) {
      for (let index = 0; index < results.length; index++) {
        const distance = results[index];

        // Check if the source_tag_name and destination_tag_name exist in distance_per_tag
        if (!distance_per_tag[distance.source_tag_name]) {
          distance_per_tag[distance.source_tag_name] = {};
        }
        if (!distance_per_tag[distance.destination_tag_name]) {
          distance_per_tag[distance.destination_tag_name] = {};
        }

        // Populate the distance_per_tag object
        distance_per_tag[distance.source_tag_name][distance.destination_tag_name] = distance.distance;
        distance_per_tag[distance.destination_tag_name][distance.source_tag_name] = distance.distance;
      }
    }

    console.log(distance_per_tag['ทางเข้าตึกอุบัติเหตุ']);
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

getDistancePerTag()

// Call fetchData every 10 seconds
setInterval(fetchData, 10000); // 10000 milliseconds = 10 seconds
// fetchData()