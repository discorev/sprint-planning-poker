const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

async function filter(arr, callback) {
  const fail = Symbol()
  return (await Promise.all(arr.map(async item => (await callback(item)) ? item : fail))).filter(i=>i!==fail)
}

exports.handler = async event => {
  let connectionData;
  
  try {
    connectionData = await ddb.scan({
      TableName: process.env.TABLE_NAME,
      ProjectionExpression: 'connectionId,playerName,choice,snoozed',
      FilterExpression: 'attribute_exists(playerName)'
    }).promise();
  } catch (err) {
    console.log('Could not find player', err);
    throw(err);
  }
  
  // Find the current player's information
  const currentPlayer = connectionData.Items.find(
    record => record.connectionId === event.requestContext.connectionId
  );

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

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

  const response = JSON.stringify({reset: true, originator: currentPlayer.playerName});

  const sendResetPromise = validConnections.map(async (record) => {
    await apigwManagementApi.postToConnection({ ConnectionId: record.connectionId, Data: response }).promise();
  });

  await Promise.all(resetPromises.concat(sendResetPromise));

  return { statusCode: 200, body: 'Player made a choice' };
};