// 进度条管理类 - 完全通过JS创建和管理DOM
export default class ProgressBar {
  constructor() {
    // 状态变量
    this.currentProgress = 0;
    this.isActive = false;
    this.elements = {}; // 存储动态创建的元素
  }
 
  // 创建DOM元素
  createElements(el) {
    el.style.position = "relative"
    // 创建容器元素
    this.elements.container = document.createElement("div");
    this.elements.container.style.width = "2.041667rem"
    this.elements.container.style.height = "0.208333rem"
    this.elements.container.style.position = "absolute"
    this.elements.container.style.left = "calc(50% - 2.041667rem / 2)"
    this.elements.container.style.top = "calc(50% - 0.208333rem / 2)"
    // 创建进度条容器
    this.elements.progressContainer = document.createElement("div");
    this.elements.progressContainer.style.width = "100%";
    this.elements.progressContainer.style.height = "0.041667rem";
    this.elements.progressContainer.style.backgroundColor = "#e0e0e0";
    this.elements.progressContainer.style.borderRadius = "0.020833rem";
    this.elements.progressContainer.style.overflow = "hidden";
    this.elements.progressContainer.style.marginBottom = "0.052083rem";
 
    // 创建进度条
    this.elements.progressBar = document.createElement("div");
    this.elements.progressBar.style.height = "100%";
    this.elements.progressBar.style.width = "0%";
    this.elements.progressBar.style.backgroundColor = "#4285f4";
    this.elements.progressBar.style.transition = "width 0.3s ease";
 
    // 创建进度信息
    this.elements.progressInfo = document.createElement("div");
    this.elements.progressInfo.style.color = "var(--color-text-two)";
    this.elements.progressInfo.style.fontSize = "0.072917rem";
    this.elements.progressInfo.style.textAlign = "right";
    this.elements.progressInfo.textContent = "当前进度: 0%";
 
    this.elements.tip = document.createElement("div");
    this.elements.tip.style.color = "#4788f9";
    this.elements.tip.style.fontSize = "0.142917rem";
    this.elements.tip.style.textAlign = "right";
    // this.elements.tip.textContent = "首次加载进度较慢，请耐心等待";
    this.elements.tip.style.transform = "translateY(1vh)";
    this.elements.tip.style.fontWeight = "700";
 
    // 组装元素
    this.elements.progressContainer.appendChild(this.elements.progressBar);
    this.elements.container.appendChild(this.elements.progressContainer);
    this.elements.container.appendChild(this.elements.progressInfo);
    this.elements.container.appendChild(this.elements.tip);
 
    // 添加到页面
    el.appendChild(this.elements.container);
    return this.elements.container;
  }
 
  // 初始化进度条
  init(el) {
    if (this.isActive) return;
    // 初始化状态
    this.currentProgress = 0;
    this.isActive = true;
    // 创建DOM元素
    
    return this.createElements(el);
  }
 
  // 更新进度
  updateProgress(percent) {
    if (!this.isActive) return false;
 
    // 确保进度在0-100之间
    const progress = Math.max(0, Math.min(100, percent));
    this.currentProgress = Number(progress).toFixed(2);
 
    // 更新UI
    this.elements.progressBar.style.width = `${progress}%`;
    this.elements.progressInfo.textContent = `当前进度: ${progress}%`;
    this.elements.progressInfo.color = "#4285f4"
 
    // 当进度达到100%时改变颜色
    if (progress === 100) {
      this.elements.progressBar.style.backgroundColor = "#34a853";
      this.elements.container.style.display = "none"
    } else {
      this.elements.progressBar.style.backgroundColor = "#4285f4";
      this.elements.container.style.display = "block"
    }
 
    return true;
  }
 
  // 销毁进度条
  destroy() {
    if (!this.isActive) return false;
    // 从DOM中移除元素
    if (this.elements.container && this.elements.container.parentNode) {
      this.elements.container.parentNode.removeChild(this.elements.container);
    }
    // 清除引用
    this.elements = {};
    this.isActive = false;
    return true;
  }
}