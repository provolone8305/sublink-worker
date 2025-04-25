
import { ClashConfigBuilder } from './ClashConfigBuilder.js';
import {  GenerateWebPath } from './utils.js';

import { t, setLanguage } from './i18n';
import yaml from 'js-yaml';
// 创建一个事件监听，拦截网络请求
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    setLanguage('zh-cn');
    if (url.pathname.startsWith('/clash')) {
      const username = url.searchParams.get('username');
      let token = url.searchParams.get('token')
      let verifyToken = await KVAuth.get(username);
      if (!verifyToken || verifyToken !== token){
        return new Response(t('内部服务器错误'), { status: 500 });
      }


      let inputString = await VEMSS_NODE.get(username);


      if (!inputString) {
        console.log('没有找到对应的配置信息')
        return new Response(t('内部服务器错误'), { status: 500 });
      }

      // 获取语言参数，如果为空则使用默认值
      let lang = 'zh-CN';
      // Get custom UserAgent
      let userAgent = url.searchParams.get('ua');
      if (!userAgent) {
        userAgent = 'curl/7.74.0';
      }
      // 设置选择的规则
      let selectedRules=['Location:CN', 'Non-China', 'Google', 'Youtube', 'AI Services', 'Telegram']
      // Deal with custom rules
      let customRules = []


      let baseConfig='';

      let configBuilder = new ClashConfigBuilder(inputString, selectedRules, customRules, baseConfig, lang, userAgent);

      const config = await configBuilder.build();

      // 设置正确的 Content-Type 和其他响应头
      const headers = {
        'content-type': 'text/yaml; charset=utf-8'
      };

      // 如果是 Surge 配置，添加 subscription-userinfo 头
      if (url.pathname.startsWith('/surge')) {
        headers['subscription-userinfo'] = 'upload=0; download=0; total=10737418240; expire=2546249531';
      }

      return new Response(
        url.pathname.startsWith('/singbox') ? JSON.stringify(config, null, 2) : config,
        { headers }
      );

    }
    else if (url.pathname === '/favicon.ico') {
      return Response.redirect('https://cravatar.cn/avatar/9240d78bbea4cf05fb04f2b86f22b18d?s=160&d=retro&r=g', 301)
    }
    else if (url.pathname === '/config') {
      const { type, content } = await request.json();
      const configId = `${type}_${GenerateWebPath(8)}`;

      try {
        let configString;
        if (type === 'clash') {
          // 如果是 YAML 格式，先转换为 JSON
          if (typeof content === 'string' && (content.trim().startsWith('-') || content.includes(':'))) {
            const yamlConfig = yaml.load(content);
            configString = JSON.stringify(yamlConfig);
          } else {
            configString = typeof content === 'object'
              ? JSON.stringify(content)
              : content;
          }
        } else {
          // singbox 配置处理
          configString = typeof content === 'object'
            ? JSON.stringify(content)
            : content;
        }

        // 验证 JSON 格式
        JSON.parse(configString);

        await SUBLINK_KV.put(configId, configString, {
          expirationTtl: 60 * 60 * 24 * 30  // 30 days
        });

        return new Response(configId, {
          headers: { 'Content-Type': 'text/plain' }
        });
      } catch (error) {
        console.error('Config validation error:', error);
        return new Response(t('invalidFormat') + error.message, {
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    return new Response(t('notFound'), { status: 404 });
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(t('internalError'), { status: 500 });
  }
}