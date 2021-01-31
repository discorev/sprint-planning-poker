const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async event => {
  const snsPayload = event.Records[0].Sns;
  console.log(snsPayload);
  let connectionData;
  
  try {
    connectionData = await ddb.scan({
      TableName: process.env.TABLE_NAME,
      ProjectionExpression: 'connectionId,playerName,choice,snoozed',
      FilterExpression: 'attribute_exists(playerName)'
    }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: snsPayload.MessageAttributes.api.Value
  });

  async function filter(arr, callback) {
    const fail = Symbol()
    return (await Promise.all(arr.map(async item => (await callback(item)) ? item : fail))).filter(i=>i!==fail)
  }

  // Filter the connections - deleting any stale ones
  // We will then continue using this array to reduce the need to re-query DDB
  const validConnections = await filter(connectionData.Items, async (record) => {
    try {
      await apigwManagementApi.getConnection({ConnectionId: record.connectionId}).promise();
      return true;
    } catch (e) {
      if (e.statusCode === 410 || e.message.includes('Invalid connectionId')) {
        console.log(`Found stale connection, deleting ${record.connectionId}`);
        await ddb.delete({
          TableName: process.env.TABLE_NAME,
          Key: {
            connectionId: record.connectionId
          }
        }).promise();

        if (record.playerName) {
          await ddb.delete({
            TableName: process.env.TABLE_NAME,
            Key: {
              connectionId: 'playerName#' + record.playerName
            }
          }).promise();
        }
      }
      return false;
    }
  });
  
  // Get the SNS message
  var message = snsPayload.Message;

  switch(message) {
    case 'REGISTER':
    case 'RESET':
      console.log('Resetting choices and sending player list');
      // Reset all players choices and send the message
      const resetPromises = validConnections.filter(record => record.choice !== null).map(async (record) => {
        await ddb.update({
          TableName: process.env.TABLE_NAME,
          Key: {
            connectionId: record.connectionId
          },
          UpdateExpression: 'set choice = :c',
          ExpressionAttributeValues: {
            ':c': null
          }
        }).promise();
      });

      const playerData = validConnections.map(record => {
        return { name: record.playerName, choice: null, snoozed: record.snoozed }
      });
      const response = JSON.stringify({ players: playerData, reset: true });

      const sendPlayerListPromises = validConnections.map(async (record) => {
        await apigwManagementApi.postToConnection({ ConnectionId: record.connectionId, Data: response }).promise();
      });

      await Promise.all(resetPromises.concat(sendPlayerListPromises));
      break;

    case 'SNOOZED':
    case 'SELECTED':
      // Check if all players are snoozed or have chosen to reveal choices.
      const sendChoiceUpdate = validConnections.map(async (record) => {
        await apigwManagementApi.postToConnection({ ConnectionId: record.connectionId, Data: message }).promise();
      });

      await Promise.all(sendChoiceUpdate);
      break;
  }
  return;
};