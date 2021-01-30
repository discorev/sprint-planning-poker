const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const sns = new AWS.SNS({apiVersion: '2010-03-31', region: process.env.AWS_REGION });

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

    var message = snsPayload.Message;

    if (message === 'send') {
        const playerData = connectionData.Items.map(record => {
            return {name: record.playerName, choice: null, snoozed: record.snoozed}
        });
        const postData = JSON.stringify({ players: playerData, reset: true });
        const postCalls = connectionData.Items.map(async (record) => {
            try {
              await apigwManagementApi.postToConnection({ ConnectionId: record.connectionId, Data: postData }).promise();
            } catch (e) {
              if (e.statusCode === 410) {
                console.log(`Found stale connection, deleting ${record.connectionId}`);
                await ddb.delete({ TableName: process.env.TABLE_NAME, Key: { connectionId: record.connectionId } }).promise();
              } else {
                throw e;
              }
            }
        });

        await Promise.all(postCalls);
    } else {
        // Loop through all connections to ensure they are still valid and delete any that are not
        // Then call SNS again, this time allowing it to send a reply to all connections
        const validConnections = connectionData.Items.map(async (record) => {
            try {
                await apigwManagementApi.getConnection({
                    ConnectionId: record.connectionId
                }).promise();
            } catch (e) {
                if (e.statusCode === 410) {
                    console.log(`Found stale connection, deleting ${record.connectionId}`);
                    await ddb.delete({
                        TableName: process.env.TABLE_NAME,
                        Key: {
                            connectionId: record.connectionId
                        }
                    }).promise();
                    await ddb.delete({
                        TableName: process.env.TABLE_NAME,
                        Key: {
                            connectionId: 'playerName#' + record.playerName
                        }
                    }).promise();
                } else {
                    throw e;
                }
            }
        });

        await Promise.all(validConnections);
        await sns.publish({
            TopicArn: snsPayload.TopicArn,
            Message: 'send',
            MessageAttributes: {
                api: {
                    DataType: 'String',
                    StringValue: snsPayload.MessageAttributes.api.Value
                }
            }
        }).promise();
    }

    return;
};